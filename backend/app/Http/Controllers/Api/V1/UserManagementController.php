<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Mail\PasswordResetLink;
use App\Models\ApplicationCall;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\OnboardingChallenge;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserAssignment;
use App\Services\AuditLogger;
use App\Services\ManagedUserScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserManagementController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly ManagedUserScope $managedUsers,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeManager($request->user());
        $query = $this->managedUsers->query($request->user());
        $users = $query
            ->with(['creator:id,title,first_name,last_name', 'assignments' => fn ($query) => $query->where('is_active', true)->latest()->with(['faculty:id,name', 'department:id,name', 'programme:id,name', 'applicationCall.programme:id,name'])])
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'locked' THEN 2 WHEN 'suspended' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END")
            ->latest()->get()->map(fn (User $user) => $this->payload($user));

        return response()->json(['data' => $users]);
    }

    public function options(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeManager($actor);
        $assignments = $actor->assignments()->effective()->get();
        $facultyIds = $assignments->pluck('faculty_id')->filter()->values();

        $faculties = Faculty::query()->where('is_active', true)
            ->with(['departments' => fn ($query) => $query->where('is_active', true)->orderBy('name')]);
        $programmes = Programme::query()
            ->whereHas('faculty', fn ($query) => $query->where('is_active', true))
            ->where(fn ($query) => $query->whereNull('department_id')->orWhereHas('department', fn ($department) => $department->where('is_active', true)));
        $calls = ApplicationCall::query()->where(fn ($query) => $query
            ->where('status', 'draft')
            ->orWhere(fn ($open) => $open->where('status', 'open')->whereDate('deadline', '>=', today())));

        if ($actor->role === UserRole::DEAN) {
            $faculties->whereIn('id', $facultyIds);
            $programmes->whereRaw('1 = 0');
            $calls->whereRaw('1 = 0');
        } elseif ($actor->role === UserRole::HOD) {
            $faculties->whereIn('id', $facultyIds);
            $programmes->whereIn('faculty_id', $facultyIds);
            $calls->whereRaw('1 = 0');
        } elseif ($actor->role === UserRole::REGISTRAR) {
            $faculties->whereRaw('1 = 0');
            $programmes->whereRaw('1 = 0');
        }

        return response()->json(['data' => [
            'faculties' => $faculties->orderBy('name')->get(),
            'programmes' => $programmes->with(['faculty:id,name', 'department:id,name'])->orderBy('name')->get()->map(fn (Programme $programme) => [
                'id' => $programme->id,
                'name' => $programme->name,
                'code' => $programme->code,
                'academic_unit' => $programme->faculty?->name,
                'department' => $programme->department?->name,
            ]),
            'calls' => $calls->with('programme:id,name')->latest('opening_date')->get()->map(fn (ApplicationCall $call) => [
                'id' => $call->id,
                'name' => ($call->programme?->name ?? 'Programme').' — '.$call->intake,
            ]),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:20'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'role' => ['required', Rule::enum(UserRole::class), Rule::notIn([UserRole::SYSADMIN->value])],
            'staff_status' => ['nullable', Rule::in(['permanent', 'temporary', 'part-time', 'contract'])],
            'faculty_id' => ['nullable', 'uuid', 'exists:faculties,id'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'programme_id' => ['nullable', 'uuid', 'exists:programmes,id'],
            'programme_ids' => ['nullable', 'array', 'max:50'],
            'programme_ids.*' => ['uuid', 'distinct', 'exists:programmes,id'],
            'application_call_id' => ['nullable', 'uuid', 'exists:application_calls,id'],
            'application_call_ids' => ['nullable', 'array', 'max:50'],
            'application_call_ids.*' => ['uuid', 'distinct', 'exists:application_calls,id'],
            'call_label' => ['nullable', 'string', 'max:255'],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'instructions' => ['nullable', 'string', 'max:2000'],
            'prior_review' => ['nullable', 'boolean'],
            'permissions' => ['nullable', 'array'],
            'permissions.create' => ['boolean'],
            'permissions.monitor' => ['boolean'],
            'permissions.close' => ['boolean'],
        ]);
        $email = Str::lower(trim($data['email']));
        if (User::whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw ValidationException::withMessages(['email' => ['An account already exists for this email address.']]);
        }
        $role = UserRole::from($data['role']);
        if ($role === UserRole::COORDINATOR) {
            $data['programme_ids'] = collect($data['programme_ids'] ?? [$data['programme_id'] ?? null])->filter()->unique()->values()->all();
            $data['programme_id'] = $data['programme_ids'][0] ?? null;
        } elseif ($role === UserRole::ADMISSIONS_OFFICER) {
            $data['application_call_ids'] = collect($data['application_call_ids'] ?? [$data['application_call_id'] ?? null])->filter()->unique()->values()->all();
            $data['application_call_id'] = $data['application_call_ids'][0] ?? null;
        }
        $this->authorizeCreateRole($request->user(), $role);
        $this->validateScope($role, $data, $request->user());
        $data = $this->withCanonicalScope($role, $data);

        [$user, $otp] = DB::transaction(function () use ($request, $data, $email, $role) {
            $user = User::create([
                'title' => trim((string) ($data['title'] ?? '')) ?: null,
                'first_name' => trim($data['first_name']),
                'last_name' => trim($data['last_name']),
                'email' => $email,
                'role' => $role,
                'status' => UserStatus::PENDING,
                'staff_status' => $data['staff_status'] ?? null,
                'password' => Str::random(64),
                'must_change_password' => true,
                'created_by' => $request->user()->id,
            ]);

            $targetIds = match ($role) {
                UserRole::COORDINATOR => $data['programme_ids'],
                UserRole::ADMISSIONS_OFFICER => $data['application_call_ids'],
                default => [null],
            };
            foreach ($targetIds as $targetId) {
                $assignmentData = $data;
                if ($role === UserRole::COORDINATOR) $assignmentData['programme_id'] = $targetId;
                if ($role === UserRole::ADMISSIONS_OFFICER) $assignmentData['application_call_id'] = $targetId;
                $assignmentData = $this->withCanonicalScope($role, $assignmentData);
                UserAssignment::create([
                    'user_id' => $user->id,
                    'role' => $role,
                    'faculty_id' => $assignmentData['faculty_id'] ?? null,
                    'department_id' => $assignmentData['department_id'] ?? null,
                    'programme_id' => $assignmentData['programme_id'] ?? null,
                    'application_call_id' => $assignmentData['application_call_id'] ?? null,
                    'starts_on' => $data['starts_on'] ?? null,
                    'ends_on' => $data['ends_on'] ?? null,
                    'instructions' => $data['instructions'] ?? null,
                    'prior_review' => (bool) ($data['prior_review'] ?? false),
                    'permissions' => array_filter(($data['permissions'] ?? []) + ['call_label' => $data['call_label'] ?? null], fn ($value) => $value !== null),
                    'is_active' => true,
                    'assigned_by' => $request->user()->id,
                ]);
            }
            if ($role === UserRole::COORDINATOR) {
                Programme::whereIn('id', $data['programme_ids'])->update(['coordinator_id' => $user->id]);
            }
            $otp = $this->issueChallenge($user);

            return [$user, $otp];
        });

        $this->sendCode($user, $otp);
        $this->audit->record($request, 'user.created', $request->user(), ['role' => $role->value], User::class, $user->id, null, ['status' => 'pending']);
        $user->load(['creator:id,title,first_name,last_name', 'assignments.faculty:id,name', 'assignments.department:id,name', 'assignments.programme:id,name', 'assignments.applicationCall.programme:id,name']);

        return response()->json([
            'data' => $this->payload($user),
            'onboarding' => $this->onboardingResponse($user, $otp),
        ], 201);
    }

    public function status(Request $request, User $user): JsonResponse
    {
        $this->authorizeTarget($request->user(), $user);
        abort_if($user->id === $request->user()->id, 422, 'You cannot change your own account status here.');
        abort_if($user->role === UserRole::SYSADMIN, 403, 'System Administrator accounts cannot be changed from this screen.');
        $data = $request->validate([
            'status' => ['required', Rule::in([UserStatus::ACTIVE->value, UserStatus::INACTIVE->value, UserStatus::SUSPENDED->value])],
            'current_password' => ['nullable', 'string', 'max:1024'],
        ]);
        if ($user->status === UserStatus::PENDING) {
            throw ValidationException::withMessages(['status' => ['Pending accounts must complete onboarding. Resend the activation code instead of changing their status.']]);
        }
        if ($data['status'] === UserStatus::ACTIVE->value && ! $user->email_verified_at) {
            throw ValidationException::withMessages(['status' => ['An unverified account cannot be activated.']]);
        }
        if ($data['status'] !== UserStatus::ACTIVE->value && in_array($user->role, [UserRole::DEAN, UserRole::REGISTRAR], true)) {
            if (! Hash::check((string) ($data['current_password'] ?? ''), $request->user()->password)) {
                throw ValidationException::withMessages(['current_password' => ['Your current password is required for this action.']]);
            }
        }
        $disabledAssignments = $data['status'] === UserStatus::ACTIVE->value
            ? $this->disableUnavailableAssignments($user)
            : 0;
        $before = ['status' => $user->status->value];
        $user->forceFill(['status' => UserStatus::from($data['status']), 'locked_until' => null, 'failed_login_attempts' => 0])->save();
        if ($user->status !== UserStatus::ACTIVE) {
            $user->tokens()->delete();
        }
        $this->audit->record($request, 'user.status_changed', $request->user(), ['unavailable_assignments_disabled' => $disabledAssignments], User::class, $user->id, $before, ['status' => $user->status->value]);

        return response()->json(['data' => $this->payload($user->load(['creator', 'assignments.faculty', 'assignments.department', 'assignments.programme', 'assignments.applicationCall.programme']))]);
    }

    public function addAssignments(Request $request, User $user): JsonResponse
    {
        $this->authorizeTarget($request->user(), $user);
        abort_unless(in_array($user->role, [UserRole::COORDINATOR, UserRole::ADMISSIONS_OFFICER], true), 422, 'Only Coordinator and Admissions Officer accounts support multiple operational assignments.');
        abort_if($user->status !== UserStatus::ACTIVE, 422, 'Reactivate this account before adding operational assignments.');

        $data = $request->validate([
            'programme_ids' => ['nullable', 'array', 'max:50'],
            'programme_ids.*' => ['uuid', 'distinct', 'exists:programmes,id'],
            'application_call_ids' => ['nullable', 'array', 'max:50'],
            'application_call_ids.*' => ['uuid', 'distinct', 'exists:application_calls,id'],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'instructions' => ['nullable', 'string', 'max:2000'],
            'prior_review' => ['nullable', 'boolean'],
            'permissions' => ['nullable', 'array'],
            'permissions.create' => ['boolean'],
            'permissions.monitor' => ['boolean'],
            'permissions.close' => ['boolean'],
        ]);
        $ids = collect($user->role === UserRole::COORDINATOR ? ($data['programme_ids'] ?? []) : ($data['application_call_ids'] ?? []))->filter()->unique()->values();
        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['assignments' => ['Select at least one programme or application call.']]);
        }
        $key = $user->role === UserRole::COORDINATOR ? 'programme_ids' : 'application_call_ids';
        $singular = $user->role === UserRole::COORDINATOR ? 'programme_id' : 'application_call_id';
        $data[$key] = $ids->all();
        $data[$singular] = $ids->first();
        $this->validateScope($user->role, $data, $request->user(), $user->id);

        $created = DB::transaction(function () use ($request, $user, $data, $ids, $singular): int {
            $count = 0;
            foreach ($ids as $id) {
                $assignmentData = $this->withCanonicalScope($user->role, array_merge($data, [$singular => $id]));
                $exists = $user->assignments()->where($singular, $id)->where('is_active', true)->exists();
                if ($exists) continue;
                UserAssignment::create([
                    'user_id' => $user->id, 'role' => $user->role,
                    'faculty_id' => $assignmentData['faculty_id'] ?? null,
                    'department_id' => $assignmentData['department_id'] ?? null,
                    'programme_id' => $assignmentData['programme_id'] ?? null,
                    'application_call_id' => $assignmentData['application_call_id'] ?? null,
                    'starts_on' => $data['starts_on'] ?? null, 'ends_on' => $data['ends_on'] ?? null,
                    'instructions' => $data['instructions'] ?? null,
                    'prior_review' => (bool) ($data['prior_review'] ?? false),
                    'permissions' => $data['permissions'] ?? [], 'is_active' => true,
                    'assigned_by' => $request->user()->id,
                ]);
                if ($user->role === UserRole::COORDINATOR) Programme::whereKey($id)->update(['coordinator_id' => $user->id]);
                $count++;
            }
            return $count;
        });
        if ($created === 0) throw ValidationException::withMessages(['assignments' => ['Every selected item is already assigned to this account.']]);
        $this->audit->record($request, 'user.assignments_added', $request->user(), ['count' => $created], User::class, $user->id);
        $user->load(['creator:id,title,first_name,last_name', 'assignments' => fn ($query) => $query->where('is_active', true)->latest()->with(['faculty:id,name', 'department:id,name', 'programme:id,name', 'applicationCall.programme:id,name'])]);

        return response()->json(['data' => $this->payload($user)]);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $this->authorizeTarget($request->user(), $user);
        abort_if($user->role === UserRole::SYSADMIN && $user->id !== $request->user()->id, 403);
        if ($user->status === UserStatus::PENDING) {
            $otp = $this->issueChallenge($user);
            $this->sendCode($user, $otp);
            $this->audit->record($request, 'user.onboarding_resent', $request->user(), [], User::class, $user->id);

            return response()->json(['delivery' => $this->onboardingResponse($user, $otp) + ['kind' => 'onboarding']]);
        }

        $token = Password::broker()->createToken($user);
        $query = http_build_query(['token' => $token, 'email' => $user->email]);
        $resetUrl = rtrim((string) config('app.frontend_url'), '/').'/reset-password?'.$query;
        Mail::to($user->email)->send(new PasswordResetLink($user, $resetUrl));
        $this->audit->record($request, 'user.password_reset_issued', $request->user(), [], User::class, $user->id);

        return response()->json(['delivery' => array_filter([
            'kind' => 'password_reset',
            'url' => app()->environment('local') ? $resetUrl : null,
            'expires_in' => (int) config('auth.passwords.users.expire', 30) * 60,
        ])]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeTarget($actor, $user);
        abort_if($user->id === $actor->id, 422, 'You cannot remove your own account.');
        abort_if($user->role === UserRole::SYSADMIN, 403, 'System Administrator accounts cannot be removed here.');

        $data = $request->validate(['current_password' => ['required', 'string', 'max:1024']]);
        if (! Hash::check($data['current_password'], $actor->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }
        if (! in_array($user->status, [UserStatus::PENDING, UserStatus::INACTIVE], true) || $user->last_login_at) {
            throw ValidationException::withMessages(['user' => ['Only a never-used pending or deactivated account can be permanently removed. Deactivate used accounts to preserve their history.']]);
        }

        $protectedRecords = User::where('created_by', $user->id)->exists()
            || DB::table('programmes')->where('created_by', $user->id)->exists()
            || DB::table('programme_versions')->where('created_by', $user->id)->exists()
            || DB::table('programme_reviews')->where('actor_id', $user->id)->exists()
            || DB::table('application_calls')->where('created_by', $user->id)->exists()
            || DB::table('knowledge_sources')->where('created_by', $user->id)->exists()
            || DB::table('knowledge_source_versions')->where('uploaded_by', $user->id)->exists();
        if ($protectedRecords) {
            throw ValidationException::withMessages(['user' => ['This account is linked to governed records and cannot be permanently removed. Deactivate it instead.']]);
        }

        $snapshot = ['email' => $user->email, 'name' => $user->name, 'role' => $user->role->value, 'status' => $user->status->value];
        $id = $user->id;
        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $user->delete();
        });
        Storage::disk('local')->delete(array_map(
            fn (string $extension): string => 'profile-photos/'.$id.'.'.$extension,
            ['jpg', 'jpeg', 'png', 'webp'],
        ));
        $this->audit->record($request, 'user.deleted', $actor, [], User::class, $id, $snapshot);

        return response()->json([], 204);
    }

    private function validateScope(UserRole $role, array $data, User $actor, ?string $excludeUserId = null): void
    {
        $required = match ($role) {
            UserRole::DEAN => ['faculty_id'],
            UserRole::HOD => ['faculty_id', 'department_id'],
            UserRole::COORDINATOR => ['programme_id', 'starts_on', 'ends_on'],
            UserRole::ADMISSIONS_OFFICER => ['application_call_id'],
            default => [],
        };
        foreach ($required as $field) {
            if (empty($data[$field])) {
                throw ValidationException::withMessages([$field => ['This assignment field is required for the selected role.']]);
            }
        }
        if (! empty($data['faculty_id']) && ! Faculty::whereKey($data['faculty_id'])->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['faculty_id' => ['The selected faculty or school is inactive or unavailable.']]);
        }
        if (! empty($data['department_id']) && ! Department::whereKey($data['department_id'])->where('faculty_id', $data['faculty_id'] ?? '')->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['department_id' => ['The department must be active and belong to the selected faculty.']]);
        }
        foreach ($data['programme_ids'] ?? [] as $programmeId) {
            if (! Programme::whereKey($programmeId)
                ->whereHas('faculty', fn ($query) => $query->where('is_active', true))
                ->where(fn ($query) => $query->whereNull('department_id')->orWhereHas('department', fn ($department) => $department->where('is_active', true)))->exists()) {
                throw ValidationException::withMessages(['programme_id' => ['Every coordinator programme must belong to an active organisation unit.']]);
            }
            if (UserAssignment::query()
                ->where('role', UserRole::COORDINATOR->value)
                ->where('programme_id', $programmeId)
                ->where('is_active', true)
                ->when($excludeUserId, fn ($query) => $query->where('user_id', '!=', $excludeUserId))
                ->where(fn ($query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $data['starts_on']))
                ->where(fn ($query) => $query->whereNull('starts_on')->orWhereDate('starts_on', '<=', $data['ends_on']))
                ->exists()) {
                throw ValidationException::withMessages(['programme_id' => ['One of the selected programmes already has a Coordinator during this assignment period.']]);
            }
        }
        foreach ($data['application_call_ids'] ?? [] as $callId) {
            if (! ApplicationCall::whereKey($callId)
                ->where(fn ($query) => $query
                    ->where('status', 'draft')
                    ->orWhere(fn ($open) => $open->where('status', 'open')->whereDate('deadline', '>=', today())))
                ->exists()) {
                throw ValidationException::withMessages(['application_call_id' => ['Every selected application call must still be available for assignment.']]);
            }
        }
        $actorAssignments = $actor->assignments()->effective()->get();
        if ($actor->role === UserRole::DEAN && ! $actorAssignments->pluck('faculty_id')->filter()->contains($data['faculty_id'] ?? null)) {
            throw ValidationException::withMessages(['faculty_id' => ['You can only delegate within your assigned faculty or school.']]);
        }
        if ($actor->role === UserRole::HOD) {
            $facultyIds = $actorAssignments->pluck('faculty_id')->filter();
            $selectedCount = collect($data['programme_ids'] ?? [])->count();
            $inScopeCount = Programme::whereIn('id', $data['programme_ids'] ?? [])->whereIn('faculty_id', $facultyIds)->count();
            if ($selectedCount === 0 || $selectedCount !== $inScopeCount) {
                throw ValidationException::withMessages(['programme_id' => ['You can only assign a coordinator to a programme in your faculty or school.']]);
            }
        }
    }

    private function withCanonicalScope(UserRole $role, array $data): array
    {
        if ($role === UserRole::COORDINATOR) {
            $programme = Programme::findOrFail($data['programme_id']);
            $data['faculty_id'] = $programme->faculty_id;
            $data['department_id'] = $programme->department_id;
        }

        if ($role === UserRole::ADMISSIONS_OFFICER) {
            $call = ApplicationCall::with('programme:id,faculty_id,department_id')->findOrFail($data['application_call_id']);
            $data['programme_id'] = $call->programme_id;
            $data['faculty_id'] = $call->programme?->faculty_id;
            $data['department_id'] = $call->programme?->department_id;
        }

        return $data;
    }

    private function disableUnavailableAssignments(User $user): int
    {
        $disabled = 0;
        foreach ($user->assignments()->where('is_active', true)->get() as $assignment) {
            $available = match ($user->role) {
                UserRole::DEAN => Faculty::whereKey($assignment->faculty_id)->where('is_active', true)->exists(),
                UserRole::HOD => Faculty::whereKey($assignment->faculty_id)->where('is_active', true)->exists()
                    && Department::whereKey($assignment->department_id)->where('faculty_id', $assignment->faculty_id)->where('is_active', true)->exists(),
                UserRole::COORDINATOR => Programme::whereKey($assignment->programme_id)
                    ->whereHas('faculty', fn ($query) => $query->where('is_active', true))
                    ->where(fn ($query) => $query->whereNull('department_id')->orWhereHas('department', fn ($department) => $department->where('is_active', true)))
                    ->exists(),
                UserRole::ADMISSIONS_OFFICER => ApplicationCall::whereKey($assignment->application_call_id)
                    ->where(fn ($query) => $query->where('status', 'draft')->orWhere(fn ($open) => $open->where('status', 'open')->whereDate('deadline', '>=', today())))
                    ->exists(),
                default => true,
            };
            if (! $available) {
                $assignment->update(['is_active' => false]);
                $disabled++;
            }
        }

        return $disabled;
    }

    private function authorizeManager(User $actor): void
    {
        abort_unless(in_array($actor->role, [UserRole::SYSADMIN, UserRole::DEAN, UserRole::HOD, UserRole::REGISTRAR], true), 403);
    }

    private function authorizeCreateRole(User $actor, UserRole $role): void
    {
        $allowed = match ($actor->role) {
            UserRole::SYSADMIN => [UserRole::DEAN, UserRole::REGISTRAR, UserRole::HOD, UserRole::COORDINATOR, UserRole::ADMISSIONS_OFFICER],
            UserRole::DEAN => [UserRole::HOD],
            UserRole::HOD => [UserRole::COORDINATOR],
            UserRole::REGISTRAR => [UserRole::ADMISSIONS_OFFICER],
            default => [],
        };
        abort_unless(in_array($role, $allowed, true), 403, 'Your role cannot create this account type.');
    }

    private function authorizeTarget(User $actor, User $target): void
    {
        $this->authorizeManager($actor);
        abort_unless($this->managedUsers->contains($actor, $target), 403, 'This account is outside your delegation.');
    }

    private function issueChallenge(User $user): string
    {
        OnboardingChallenge::where('user_id', $user->id)->whereNull('consumed_at')->update(['consumed_at' => now()]);
        $otp = (string) random_int(100000, 999999);
        OnboardingChallenge::create(['user_id' => $user->id, 'otp_hash' => Hash::make($otp), 'expires_at' => now()->addMinutes(15)]);

        return $otp;
    }

    private function sendCode(User $user, string $otp): void
    {
        Mail::raw("Hello {$user->first_name},\n\nYour KYU PCS activation/reset code is {$otp}. It expires in 15 minutes.\n\nOpen ".url('/onboarding?email='.urlencode($user->email)), fn ($message) => $message->to($user->email)->subject('Your KYU PCS verification code'));
    }

    private function onboardingResponse(User $user, string $otp): array
    {
        return array_filter([
            'url' => '/onboarding?email='.urlencode($user->email),
            'expires_in' => 900,
            'development_otp' => app()->environment('local') || config('app.expose_admin_onboarding_otp') ? $otp : null,
        ]);
    }

    private function payload(User $user): array
    {
        $assignment = $user->assignments->first(fn (UserAssignment $assignment) => $assignment->isEffective()) ?? $user->assignments->first();

        return [
            'id' => $user->id,
            'title' => $user->title ?? '',
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'role' => $user->role->value,
            'status' => $user->status->value,
            'staff_status' => $user->staff_status,
            'created_at' => $user->created_at?->toDateString(),
            'created_by' => $user->creator?->name ?? 'System bootstrap',
            'can_delete' => in_array($user->status, [UserStatus::PENDING, UserStatus::INACTIVE], true) && ! $user->last_login_at,
            'assignment' => $assignment ? $this->assignmentPayload($assignment) : null,
            'assignments' => $user->assignments->map(fn (UserAssignment $item) => $this->assignmentPayload($item))->values(),
        ];
    }

    private function assignmentPayload(UserAssignment $assignment): array
    {
        $permissions = $assignment->permissions ?? [];

        return [
            'faculty_id' => $assignment->faculty_id,
            'faculty' => $assignment->faculty?->name,
            'department_id' => $assignment->department_id,
            'department' => $assignment->department?->name,
            'programme_id' => $assignment->programme_id,
            'programme' => $assignment->programme?->name,
            'application_call_id' => $assignment->application_call_id,
            'starts_on' => $assignment->starts_on?->toDateString(),
            'ends_on' => $assignment->ends_on?->toDateString(),
            'instructions' => $assignment->instructions,
            'prior_review' => $assignment->prior_review,
            'is_effective' => $assignment->isEffective(),
            'call_label' => $assignment->applicationCall
                ? (($assignment->applicationCall->programme?->name ?? 'Programme').' — '.$assignment->applicationCall->intake)
                : ($permissions['call_label'] ?? null),
            'permissions' => array_intersect_key($permissions, array_flip(['create', 'monitor', 'close'])),
        ];
    }
}
