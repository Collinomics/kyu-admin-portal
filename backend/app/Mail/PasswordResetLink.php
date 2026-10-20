<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetLink extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly User $account, public readonly string $resetUrl) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reset your KYU PCS password');
    }

    public function content(): Content
    {
        return new Content(text: 'mail.password-reset');
    }
}
