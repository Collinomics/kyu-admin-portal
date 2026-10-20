<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class RoleMatrixController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $roles = [
            ['id' => 'SYSADMIN', 'label' => 'System Administrator', 'short_label' => 'SysAdmin'],
            ['id' => 'DEAN', 'label' => 'Dean of Faculty/School', 'short_label' => 'Dean'],
            ['id' => 'REGISTRAR', 'label' => 'Academic Registrar', 'short_label' => 'Registrar'],
            ['id' => 'HOD', 'label' => 'Head of Department', 'short_label' => 'HOD'],
            ['id' => 'COORDINATOR', 'label' => 'Programme Coordinator', 'short_label' => 'Coordinator'],
            ['id' => 'ADMISSIONS_OFFICER', 'label' => 'Admissions Officer', 'short_label' => 'Officer'],
        ];

        $row = fn (string $id, string $name, string $sysadmin, string $dean, string $registrar, string $hod, string $coordinator, string $officer): array => [
            'id' => $id,
            'name' => $name,
            'roles' => compact('sysadmin', 'dean', 'registrar', 'hod', 'coordinator', 'officer'),
        ];

        return response()->json(['data' => [
            'roles' => $roles,
            'capabilities' => [
                $row('view-programmes', 'View programme records', 'yes', 'scoped', 'no', 'scoped', 'scoped', 'no'),
                $row('create-programme', 'Create canonical programme records', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('edit-content', 'Edit programme content', 'yes', 'no', 'no', 'no', 'scoped', 'no'),
                $row('review-forward', 'Review & forward programmes', 'yes', 'no', 'no', 'scoped', 'no', 'no'),
                $row('publish', 'Publish programmes', 'yes', 'scoped', 'no', 'no', 'no', 'no'),
                $row('reject', 'Reject programme submissions', 'yes', 'scoped', 'no', 'scoped', 'no', 'no'),
                $row('recommend', 'Recommend changes to published profiles', 'yes', 'scoped', 'no', 'no', 'no', 'no'),
                $row('delete-programme', 'Delete draft / rejected programmes', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('create-dean-reg', 'Create Dean / Registrar accounts', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('create-hod', 'Create HOD accounts', 'yes', 'scoped', 'no', 'no', 'no', 'no'),
                $row('create-coord', 'Create Coordinator accounts', 'yes', 'no', 'no', 'scoped', 'no', 'no'),
                $row('create-officer', 'Create Admissions Officer accounts', 'yes', 'no', 'scoped', 'no', 'no', 'no'),
                $row('view-calls', 'View calls for application', 'yes', 'no', 'yes', 'no', 'no', 'scoped'),
                $row('create-calls', 'Create / publish calls for application', 'yes', 'no', 'yes', 'no', 'no', 'scoped'),
                $row('close-calls', 'Close calls for application', 'yes', 'no', 'yes', 'no', 'no', 'scoped'),
                $row('reset-passwords', 'Reset passwords for managed accounts', 'yes', 'scoped', 'scoped', 'scoped', 'no', 'no'),
                $row('audit', 'View the audit log', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('role-policy', 'View the role policy matrix', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('settings', 'Configure shared system settings', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('ai-monitor', 'Monitor AI performance and safety events', 'yes', 'no', 'no', 'no', 'no', 'no'),
                $row('ai-config', 'Manage AI settings and knowledge sources', 'yes', 'no', 'no', 'no', 'no', 'no'),
            ],
            'enforcement' => 'server',
            'editable' => false,
        ]]);
    }
}
