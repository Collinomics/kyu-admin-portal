<?php

namespace App\Enums;

enum UserRole: string
{
    case SYSADMIN = 'SYSADMIN';
    case DEAN = 'DEAN';
    case REGISTRAR = 'REGISTRAR';
    case HOD = 'HOD';
    case COORDINATOR = 'COORDINATOR';
    case ADMISSIONS_OFFICER = 'ADMISSIONS_OFFICER';
}
