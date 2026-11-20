import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { switchMap, finalize } from 'rxjs/operators';
import { User } from '../user.model';
import { AuthService } from '../../auth/auth.service';
import { UserService } from '../user.service';

export interface ChangePasswordDialogData {
  user: User;
}

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
    control.get('confirmPassword')?.setErrors({ mismatch: true });
    return { mismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './change-password-dialog.component.html',
  styleUrl: './change-password-dialog.component.css'
})
export class ChangePasswordDialogComponent {
  data = inject<ChangePasswordDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ChangePasswordDialogComponent>);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private userService = inject(UserService);

  hideOldPassword = signal<boolean>(true);
  hideNewPassword = signal<boolean>(true);
  hideConfirmPassword = signal<boolean>(true);

  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  form: FormGroup = this.fb.group({
    oldPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: passwordMatchValidator });

  get user(): User {
    return this.data.user;
  }

  toggleOldPasswordVisibility(): void {
    this.hideOldPassword.update(v => !v);
  }

  toggleNewPasswordVisibility(): void {
    this.hideNewPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const { oldPassword, newPassword } = this.form.value;
    const mobile = this.user.mobile;
    const userId = this.user.userId;

    if (!userId) {
      this.errorMessage.set('User ID not found for this account.');
      this.isSubmitting.set(false);
      return;
    }

    // Step 1: Validate current (old) password using login API
    this.authService.loginWithPassword({
      mobile,
      password: oldPassword
    }).pipe(
      switchMap(() => {
        // Step 2: Old password valid! Update to the new password
        return this.userService.setTempPassword(userId, newPassword);
      }),
      finalize(() => this.isSubmitting.set(false))
    ).subscribe({
      next: () => {
        this.dialogRef.close({ success: true });
      },
      error: (err: any) => {
        console.error('Password change error:', err);
        if (err.status === 401 || err.status === 400) {
          this.errorMessage.set('Current password is incorrect. Please verify and try again.');
          this.form.get('oldPassword')?.setErrors({ incorrect: true });
          this.form.get('oldPassword')?.markAsTouched();
        } else {
          this.errorMessage.set(err.error?.message || err.message || 'Failed to update password. Please try again.');
        }
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
