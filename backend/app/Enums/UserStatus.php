<?php

namespace App\Enums;

enum UserStatus: string
{
    case ACTIVE = 'active';
    case PENDING = 'pending';
    case LOCKED = 'locked';
    case SUSPENDED = 'suspended';
    case INACTIVE = 'inactive';
}
