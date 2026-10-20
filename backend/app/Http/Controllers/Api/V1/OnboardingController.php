<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\OnboardingChallenge;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OnboardingController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function verify(Request $request): JsonResponse
    {
        [$user] = $this->validChallenge($request);

        return response()->json(['data' => ['email' => $user->email, 'verified' => true]]);
    }

    public function complete(Request $request): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string', 'min:12', 'max:1024', 'confirmed', 'regex:/[a-z]/', 'regex:/[A-Z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/'],
        ]);
        $user = DB::transaction(function () use ($request): User {
            [$user, $challenge] = $this->validChallenge($request, true);
            $user->forceFill([
                'password' => $request->string('password')->toString(),
                'status' => UserStatus::ACTIVE,
                'email_verified_at' => $user->email_verified_at ?? now(),
                'must_change_password' => false,
                'password_changed_at' => now(),
                'failed_login_attempts' => 0,
                'locked_until' => null,
            ])->save();
            $challenge->update(['consumed_at' => now()]);
            $user->tokens()->delete();

            return $user;
        });
        $this->audit->record($request, 'auth.onboarding_completed', $user);

        return response()->json(['data' => ['activated' => true]]);
    }

    public function resend(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc']]);
        $user = User::whereRaw('LOWER(email) = ?', [Str::lower(trim($data['email']))])->first();
        $otp = null;
        if ($user?->status === UserStatus::PENDING) {
            OnboardingChallenge::where('user_id', $user->id)->whereNull('consumed_at')->update(['consumed_at' => now()]);
            $otp = (string) random_int(100000, 999999);
            OnboardingChallenge::create([
                'user_id' => $user->id,
                'otp_hash' => Hash::make($otp),
                'expires_at' => now()->addMinutes(15),
            ]);
            Mail::raw("Hello {$user->first_name},\n\nYour new KYU PCS verification code is {$otp}. It expires in 15 minutes.", fn ($message) => $message->to($user->email)->subject('Your new KYU PCS verification code'));
            $this->audit->record($request, 'auth.onboarding_resent', $user);
        }

        return response()->json(['data' => array_filter([
            'message' => 'If the account exists, a new verification code has been issued.',
            'development_otp' => app()->environment('local') ? $otp : null,
        ])]);
    }

    private function validChallenge(Request $request, bool $lock = false): array
    {
        $data = $request->validate(['email' => ['required', 'email:rfc'], 'otp' => ['required', 'digits:6']]);
        $userQuery = User::whereRaw('LOWER(email) = ?', [Str::lower(trim($data['email']))]);
        $user = ($lock ? $userQuery->lockForUpdate() : $userQuery)->first();
        $challengeQuery = $user?->status === UserStatus::PENDING
            ? OnboardingChallenge::where('user_id', $user->id)->whereNull('consumed_at')->latest()
            : null;
        $challenge = $challengeQuery ? ($lock ? $challengeQuery->lockForUpdate() : $challengeQuery)->first() : null;
        if (! $challenge || $challenge->expires_at->isPast() || $challenge->attempts >= 5 || ! Hash::check($data['otp'], $challenge->otp_hash)) {
            if ($challenge) {
                $challenge->increment('attempts');
            }
            throw ValidationException::withMessages(['otp' => ['The verification code is invalid or has expired.']]);
        }

        return [$user, $challenge];
    }
}
