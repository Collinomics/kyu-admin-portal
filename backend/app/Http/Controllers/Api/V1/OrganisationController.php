<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\AffiliatedInstitution;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrganisationController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->faculties()]);
    }

    public function affiliates(Request $request): JsonResponse
    {
        $perPage = max(10, min(50, (int) $request->query('per_page', 20)));
        $query = AffiliatedInstitution::query()->where('is_published', true);
        if ($search = trim((string) $request->query('search'))) {
            $needle = '%'.Str::lower($search).'%';
            $query->where(fn ($builder) => $builder
                ->whereRaw('LOWER(name) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(institution_type, \'\')) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(location, \'\')) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(affiliation_status, \'\')) LIKE ?', [$needle]));
        }

        $page = $query->orderBy('name')->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (AffiliatedInstitution $institution) => [
                'id' => $institution->id,
                'name' => $institution->name,
                'institution_type' => $institution->institution_type,
                'location' => $institution->location,
                'affiliation_status' => $institution->affiliation_status,
                'offerings' => $institution->offerings,
                'overview' => $institution->overview,
                'version' => $institution->version,
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function storeFaculty(Request $request): JsonResponse
    {
        $data = $this->validateUnit($request);
        $this->ensureUniqueFaculty($data['code'], $data['name']);
        $faculty = Faculty::create($data);
        $this->audit->record($request, 'organisation.faculty_created', $request->user(), [], Faculty::class, $faculty->id, null, $faculty->only(['code', 'name', 'is_active']));

        return response()->json(['data' => $this->faculty($faculty)], 201);
    }

    public function updateFaculty(Request $request, Faculty $faculty): JsonResponse
    {
        $data = $this->validateUnit($request, true);
        $this->ensureUniqueFaculty($data['code'], $data['name'], $faculty->id);
        $before = $faculty->only(['code', 'name', 'is_active']);
        $deactivating = $faculty->is_active && ! $data['is_active'];
        if ($deactivating) {
            $this->confirmPassword($request);
            if ($faculty->assignments()->allocated()->exists()) {
                throw ValidationException::withMessages(['faculty' => ['Reassign or deactivate staff attached to this faculty before deactivating it.']]);
            }
        }

        DB::transaction(function () use ($faculty, $data, $deactivating): void {
            $faculty->update($data);
            if ($deactivating) {
                $faculty->departments()->update(['is_active' => false]);
            }
        });
        $this->audit->record($request, 'organisation.faculty_updated', $request->user(), [], Faculty::class, $faculty->id, $before, $faculty->fresh()->only(['code', 'name', 'is_active']));

        return response()->json(['data' => $this->faculty($faculty->fresh())]);
    }

    public function storeDepartment(Request $request): JsonResponse
    {
        $data = $this->validateDepartment($request);
        $faculty = Faculty::findOrFail($data['faculty_id']);
        if (! $faculty->is_active) {
            throw ValidationException::withMessages(['faculty_id' => ['Activate the faculty before adding a department.']]);
        }
        $this->ensureUniqueDepartment($data['faculty_id'], $data['code'], $data['name']);
        $department = Department::create($data);
        $this->audit->record($request, 'organisation.department_created', $request->user(), ['faculty_id' => $faculty->id], Department::class, $department->id, null, $department->only(['faculty_id', 'code', 'name', 'is_active']));

        return response()->json(['data' => $this->department($department)], 201);
    }

    public function updateDepartment(Request $request, Department $department): JsonResponse
    {
        $data = $this->validateDepartment($request, $department->faculty_id);
        $this->ensureUniqueDepartment($department->faculty_id, $data['code'], $data['name'], $department->id);
        $before = $department->only(['faculty_id', 'code', 'name', 'is_active']);
        $deactivating = $department->is_active && ! $data['is_active'];
        if ($deactivating) {
            $this->confirmPassword($request);
            if ($department->assignments()->allocated()->exists()) {
                throw ValidationException::withMessages(['department' => ['Reassign or deactivate staff attached to this department before deactivating it.']]);
            }
        }
        if ($data['is_active'] && ! $department->faculty()->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['department' => ['Activate the parent faculty before activating this department.']]);
        }
        $department->update($data);
        $this->audit->record($request, 'organisation.department_updated', $request->user(), [], Department::class, $department->id, $before, $department->fresh()->only(['faculty_id', 'code', 'name', 'is_active']));

        return response()->json(['data' => $this->department($department->fresh())]);
    }

    private function validateUnit(Request $request, bool $updating = false): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9_-]+$/'],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => [$updating ? 'required' : 'sometimes', 'boolean'],
            'current_password' => ['nullable', 'string', 'max:1024'],
        ]);

        return ['code' => Str::upper(trim($data['code'])), 'name' => trim($data['name']), 'is_active' => (bool) ($data['is_active'] ?? true)];
    }

    private function validateDepartment(Request $request, ?string $facultyId = null): array
    {
        $data = $request->validate([
            'faculty_id' => [$facultyId ? 'sometimes' : 'required', 'uuid', 'exists:faculties,id'],
            'code' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9_-]+$/'],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'current_password' => ['nullable', 'string', 'max:1024'],
        ]);

        return [
            'faculty_id' => $facultyId ?? $data['faculty_id'],
            'code' => Str::upper(trim($data['code'])),
            'name' => trim($data['name']),
            'is_active' => (bool) ($data['is_active'] ?? true),
        ];
    }

    private function ensureUniqueFaculty(string $code, string $name, ?string $except = null): void
    {
        $query = Faculty::query()->where(fn ($query) => $query->whereRaw('LOWER(code) = ?', [Str::lower($code)])->orWhereRaw('LOWER(name) = ?', [Str::lower($name)]));
        if ($except) {
            $query->whereKeyNot($except);
        }
        if ($query->exists()) {
            throw ValidationException::withMessages(['name' => ['A faculty or school with this name or code already exists.']]);
        }
    }

    private function ensureUniqueDepartment(string $facultyId, string $code, string $name, ?string $except = null): void
    {
        $query = Department::query()->where('faculty_id', $facultyId)
            ->where(fn ($query) => $query->whereRaw('LOWER(code) = ?', [Str::lower($code)])->orWhereRaw('LOWER(name) = ?', [Str::lower($name)]));
        if ($except) {
            $query->whereKeyNot($except);
        }
        if ($query->exists()) {
            throw ValidationException::withMessages(['name' => ['A department with this name or code already exists in the faculty.']]);
        }
    }

    private function confirmPassword(Request $request): void
    {
        if (! Hash::check((string) $request->input('current_password'), $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is required to deactivate an organisation unit.']]);
        }
    }

    private function faculties(): array
    {
        return Faculty::query()->withCount(['programmes', 'assignments as active_assignments_count' => fn ($query) => $query->allocated()])
            ->with(['departments' => fn ($query) => $query->withCount(['programmes', 'assignments as active_assignments_count' => fn ($query) => $query->allocated()])->orderBy('name')])
            ->orderBy('name')->get()->map(fn (Faculty $faculty) => $this->faculty($faculty))->all();
    }

    private function faculty(Faculty $faculty): array
    {
        if (! $faculty->relationLoaded('departments')) {
            $faculty->loadCount(['programmes', 'assignments as active_assignments_count' => fn ($query) => $query->allocated()]);
            $faculty->load(['departments' => fn ($query) => $query->withCount(['programmes', 'assignments as active_assignments_count' => fn ($query) => $query->allocated()])->orderBy('name')]);
        }

        return [
            'id' => $faculty->id, 'code' => $faculty->code, 'name' => $faculty->name, 'is_active' => $faculty->is_active,
            'programmes_count' => (int) $faculty->programmes_count, 'active_assignments_count' => (int) $faculty->active_assignments_count,
            'departments' => $faculty->departments->map(fn (Department $department) => $this->department($department))->all(),
        ];
    }

    private function department(Department $department): array
    {
        if (! isset($department->programmes_count)) {
            $department->loadCount(['programmes', 'assignments as active_assignments_count' => fn ($query) => $query->allocated()]);
        }

        return [
            'id' => $department->id, 'faculty_id' => $department->faculty_id, 'code' => $department->code,
            'name' => $department->name, 'is_active' => $department->is_active,
            'programmes_count' => (int) $department->programmes_count, 'active_assignments_count' => (int) $department->active_assignments_count,
        ];
    }
}
