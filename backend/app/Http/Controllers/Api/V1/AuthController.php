<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Mail\PasswordResetLink;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\UserAssignment;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AuthController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
            'device_name' => ['sometimes', 'string', 'max:100'],
        ]);

        $email = Str::lower(trim($data['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if ($user?->locked_until?->isFuture()) {
            return response()->json([
                'code' => 'ACCOUNT_LOCKED',
                'message' => 'This account is temporarily locked after repeated failed attempts.',
                'retry_after' => now()->diffInSeconds($user->locked_until),
            ], 423);
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($user) {
                if ($this->registerFailure($request, $user)) {
                    return response()->json([
                        'code' => 'ACCOUNT_LOCKED',
                        'message' => 'This account is temporarily locked after repeated failed attempts.',
                        'retry_after' => now()->diffInSeconds($user->locked_until),
                    ], 423);
                }
            } else {
                Hash::check($data['password'], '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');
            }
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }

        if ($user->status === UserStatus::PENDING) {
            return response()->json(['code' => 'ONBOARDING_REQUIRED', 'message' => 'Complete account onboarding before signing in.'], 403);
        }
        if (in_array($user->status, [UserStatus::SUSPENDED, UserStatus::INACTIVE], true)) {
            return response()->json(['code' => 'ACCOUNT_UNAVAILABLE', 'message' => 'This account is not available. Contact the System Administrator.'], 403);
        }

        $user->forceFill([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'status' => $user->status === UserStatus::LOCKED ? UserStatus::ACTIVE : $user->status,
            'last_login_at' => now(),
        ])->save();

        $token = $user->createToken($data['device_name'] ?? 'admin-portal', ['portal'], now()->addHours(8));
        $this->audit->record($request, 'auth.login', $user);

        return response()->json(['data' => ['user' => $this->userPayload($user), 'token' => $token->plainTextToken]]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->userPayload($request->user()->load('assignments'))]);
    }

    public function profile(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->userPayload($request->user())]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:20'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'photo' => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:max_width=2000,max_height=2000'],
        ]);
        $user = $request->user();
        $oldPhoto = $this->profilePhotoPath($user);
        $before = $user->only(['title', 'first_name', 'last_name']) + ['profile_photo_path' => $oldPhoto];
        $newPhoto = null;

        $user->fill([
            'title' => trim((string) ($data['title'] ?? '')) ?: null,
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
        ]);
        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $this->deleteStoredProfilePhotos($user);
            $safeName = $user->id.'.'.strtolower($photo->extension());
            $newPhoto = $photo->storeAs('profile-photos', $safeName, 'local');
        }
        $user->save();
        $this->audit->record($request, 'profile.updated', $user, [], User::class, $user->id, $before, $user->fresh()->only(['title', 'first_name', 'last_name']) + ['profile_photo_path' => $newPhoto ?? $oldPhoto]);

        return response()->json(['data' => $this->userPayload($user->fresh())]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string', 'max:1024'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()->symbols(), 'max:1024'],
        ]);
        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }
        $user->forceFill(['password' => $data['password'], 'password_changed_at' => now(), 'must_change_password' => false])->save();
        $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();
        $this->audit->record($request, 'profile.password_changed', $user, [], User::class, $user->id);

        return response()->json(['data' => ['changed' => true]]);
    }

    public function profilePhoto(Request $request): BinaryFileResponse
    {
        $path = $this->profilePhotoPath($request->user());
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function deleteProfilePhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($path = $this->profilePhotoPath($user)) {
            $this->deleteStoredProfilePhotos($user);
            $user->touch();
            $this->audit->record($request, 'profile.photo_removed', $user, [], User::class, $user->id);
        }

        return response()->json([], 204);
    }

    public function reauthenticate(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:1024']]);
        if (! Hash::check($data['password'], $request->user()->password)) {
            return response()->json(['code' => 'INVALID_PASSWORD', 'message' => 'Password confirmation failed.'], 422);
        }
        $this->audit->record($request, 'auth.reauthenticated', $request->user());

        return response()->json(['data' => ['reauthenticated_at' => now()->toIso8601String()]]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->audit->record($request, 'auth.logout', $request->user());
        $request->user()->currentAccessToken()?->delete();

        return response()->json([], 204);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:255']]);
        $email = Str::lower(trim($data['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();
        $developmentUrl = null;

        if ($user && in_array($user->status, [UserStatus::ACTIVE, UserStatus::LOCKED], true)) {
            $token = Password::broker()->createToken($user);
            $query = http_build_query(['token' => $token, 'email' => $user->email]);
            $developmentUrl = rtrim((string) config('app.frontend_url'), '/').'/reset-password?'.$query;
            Mail::to($user->email)->send(new PasswordResetLink($user, $developmentUrl));
            $this->audit->record($request, 'auth.password_reset_requested', $user);
        }

        return response()->json(['data' => array_filter([
            'message' => 'If an eligible account exists for that email, a secure reset link has been issued.',
            'development_url' => app()->environment('local') ? $developmentUrl : null,
        ])]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'token' => ['required', 'string', 'max:2048'],
            'password' => ['required', 'string', 'min:12', 'max:1024', 'confirmed', 'regex:/[a-z]/', 'regex:/[A-Z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/'],
        ]);
        $data['email'] = Str::lower(trim($data['email']));
        $resetUser = null;
        $status = Password::broker()->reset($data, function (User $user, string $password) use (&$resetUser) {
            $user->forceFill([
                'password' => $password,
                'password_changed_at' => now(),
                'must_change_password' => false,
                'failed_login_attempts' => 0,
                'locked_until' => null,
                'status' => $user->status === UserStatus::LOCKED ? UserStatus::ACTIVE : $user->status,
            ])->save();
            $user->tokens()->delete();
            $resetUser = $user;
        });

        if ($status !== Password::PASSWORD_RESET || ! $resetUser) {
            throw ValidationException::withMessages(['token' => ['This reset link is invalid, expired, or has already been used.']]);
        }
        $this->audit->record($request, 'auth.password_reset_completed', $resetUser);

        return response()->json(['data' => ['reset' => true]]);
    }

    private function registerFailure(Request $request, User $user): bool
    {
        if ($user->locked_until?->isPast()) {
            $user->failed_login_attempts = 0;
            $user->locked_until = null;
        }
        $user->failed_login_attempts++;
        if ($user->failed_login_attempts >= SystemSetting::integer('max_failed_login_attempts', 5)) {
            $user->status = UserStatus::LOCKED;
            $user->locked_until = now()->addMinutes(15);
        }
        $user->save();
        if ($user->status === UserStatus::LOCKED) {
            $user->tokens()->delete();
        }
        $this->audit->record($request, 'auth.login_failed', $user, ['attempt' => $user->failed_login_attempts]);

        return $user->locked_until?->isFuture() ?? false;
    }

    private function userPayload(User $user): array
    {
        $user->loadMissing([
            'assignments.faculty:id,name',
            'assignments.department:id,name',
        ]);
        $assignment = $user->assignments
            ->sortByDesc('created_at')
            ->first(fn (UserAssignment $assignment) => $assignment->isEffective())
            ?? $user->assignments->sortByDesc('created_at')->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'title' => $user->title ?? '',
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'has_profile_photo' => (bool) $this->profilePhotoPath($user),
            'profile_updated_at' => $user->updated_at?->toIso8601String(),
            'faculty' => $assignment?->faculty?->name,
            'department' => $assignment?->department?->name,
            'role' => $user->role->value,
            'status' => $user->status->value,
            'must_change_password' => $user->must_change_password,
            'assignments' => $user->relationLoaded('assignments') ? $user->assignments : [],
        ];
    }

    private function profilePhotoPath(User $user): ?string
    {
        foreach (['jpg', 'jpeg', 'png', 'webp'] as $extension) {
            $path = 'profile-photos/'.$user->id.'.'.$extension;
            if (Storage::disk('local')->exists($path)) return $path;
        }

        return null;
    }

    private function deleteStoredProfilePhotos(User $user): void
    {
        Storage::disk('local')->delete(array_map(
            fn (string $extension): string => 'profile-photos/'.$user->id.'.'.$extension,
            ['jpg', 'jpeg', 'png', 'webp'],
        ));
    }
}
