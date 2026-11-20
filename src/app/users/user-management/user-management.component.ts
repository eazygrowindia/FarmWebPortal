import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { catchError, finalize } from 'rxjs';
import { UserService } from '../user.service';
import { UserDialogComponent } from '../user-dialog/user-dialog.component';
import { User, UserRole } from '../user.model';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { UserDetailDialogComponent } from '../user-detail-dialog/user-detail-dialog.component';
import { environment } from '../../../environments/environment';

export interface UserRow extends User {
  displayRoles: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css'
})
export class UserManagementComponent {
  readonly displayedColumns = ['user', 'contact', 'roles', 'systemStatus', 'actions'] as const;

  private userService = inject(UserService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  users = signal<UserRow[]>([]);
  loading = signal(false);

  // Filter signals
  searchTerm = signal<string>('');
  selectedRoleFilter = signal<string>('ALL');
  selectedStatusFilter = signal<string>('ALL');

  // KPI Statistics
  totalUsersCount = computed(() => this.users().length);
  activeUsersCount = computed(() => this.users().filter(u => u.systemStatus === 'ACTIVE').length);
  deactivatedUsersCount = computed(() => this.users().filter(u => u.systemStatus !== 'ACTIVE').length);
  adminUsersCount = computed(() => this.users().filter(u => (u.roles || []).includes('EASYGROWADMIN')).length);

  hasActiveFilters = computed(() =>
    this.searchTerm().trim().length > 0 ||
    this.selectedRoleFilter() !== 'ALL' ||
    this.selectedStatusFilter() !== 'ALL'
  );

  filteredUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const roleFilter = this.selectedRoleFilter();
    const statusFilter = this.selectedStatusFilter();

    return this.users()
      .map(u => ({
        ...u,
        displayRoles: (u.roles || []).join(', ')
      }))
      .filter(user => {
        // Search filter: check name, mobile, email, userId, displayRoles
        const matchesSearch = !term ||
          (user.name && user.name.toLowerCase().includes(term)) ||
          (user.mobile && user.mobile.toLowerCase().includes(term)) ||
          (user.email && user.email.toLowerCase().includes(term)) ||
          (user.userId && user.userId.toLowerCase().includes(term)) ||
          (user.displayRoles && user.displayRoles.toLowerCase().includes(term));

        // Role filter
        const matchesRole = roleFilter === 'ALL' || (user.roles && user.roles.includes(roleFilter as UserRole));

        // Status filter
        const matchesStatus = statusFilter === 'ALL' ||
          (statusFilter === 'ACTIVE' && user.systemStatus === 'ACTIVE') ||
          (statusFilter === 'DEACTIVATED' && user.systemStatus !== 'ACTIVE');

        return matchesSearch && matchesRole && matchesStatus;
      });
  });

  constructor() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.userService.getUsers()
      .pipe(
        catchError(err => {
          this.snackBar.open('Failed to load users from server', 'Close', { duration: 3500 });
          console.error('Load users error:', err);
          return [];
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe(users => {
        const rows: UserRow[] = (users || []).map(u => ({
          ...u,
          displayRoles: (u.roles || []).join(', ')
        }));
        this.users.set(rows);
      });
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term || '');
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  setRoleFilter(role: string): void {
    this.selectedRoleFilter.set(role);
  }

  setStatusFilter(status: string): void {
    this.selectedStatusFilter.set(status);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedRoleFilter.set('ALL');
    this.selectedStatusFilter.set('ALL');
  }

  getInitials(name: string | undefined): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'EASYGROWADMIN': return 'badge-role-admin';
      case 'FARMOWNER': return 'badge-role-owner';
      case 'FARMHELP': return 'badge-role-help';
      case 'AGRONOMIST': return 'badge-role-agronomist';
      case 'TRANSCRIBER': return 'badge-role-transcriber';
      default: return 'badge-role-default';
    }
  }

  getRoleDisplayName(role: string): string {
    const displayMap: Record<string, string> = {
      EASYGROWADMIN: 'Admin',
      FARMOWNER: 'Farm Owner',
      FARMHELP: 'Farm Help',
      AGRONOMIST: 'Agronomist',
      TRANSCRIBER: 'Transcriber',
      UNKNOWN: 'Unknown'
    };
    return displayMap[role] || role;
  }

  openCreateDialog() {
    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe({
      next: userData => {
        if (!userData) return;

        this.userService.createUser(userData).subscribe({
          next: createdUser => {
            const row: UserRow = {
              ...(createdUser as User),
              displayRoles: (createdUser.roles || []).join(', ')
            };
            this.users.update(users => [row, ...users]);
            this.snackBar.open(`User "${row.name}" created successfully!`, 'Close', { duration: 3000 });
          },
          error: err => {
            console.error('Create user failed', err);
            this.snackBar.open('User creation failed. Please check details and try again.', 'Close', { duration: 4000 });
          }
        });
      }
    });
  }

  viewUser(user: UserRow): void {
    const dialogRef = this.dialog.open(UserDetailDialogComponent, {
      width: '840px',
      maxWidth: '96vw',
      maxHeight: '94vh',
      panelClass: 'user-detail-dialog-panel',
      data: { user }
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (!result) return;
      if (result.action === 'edit') {
        this.editUser(user);
      } else if (result.action === 'changePassword') {
        this.setTempPassword(user);
      }
    });
  }

  editUser(user: UserRow) {
    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { mode: 'edit', user }
    });

    dialogRef.afterClosed().subscribe({
      next: userData => {
        if (!userData) return;

        this.userService.updateUser(user.userId!, userData).subscribe({
          next: updatedUser => {
            this.users.update(users =>
              users.map(u => u.userId === user.userId ? {
                ...(u as any),
                ...updatedUser,
                displayRoles: (updatedUser.roles || u.roles || []).join(', ')
              } : u)
            );
            this.snackBar.open(`User "${userData.name || user.name}" updated successfully!`, 'Close', { duration: 3000 });
          },
          error: err => {
            console.error('Update user failed', err);
            this.snackBar.open('User update failed. Please try again.', 'Close', { duration: 4000 });
          }
        });
      }
    });
  }

  setTempPassword(user: User) {
    const tempPassword = environment.tempPassword;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: 'Reset Password',
        message: `Set temporary password "${tempPassword}" for user "${user.name}"?`,
        action: 'Reset Password'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;

      this.userService.setTempPassword(user.userId!, tempPassword).subscribe({
        next: () => {
          this.snackBar.open(`Temporary password updated for "${user.name}"!`, 'Close', { duration: 3500 });
        },
        error: err => {
          console.error('Temporary password update failed', err);
          this.snackBar.open('Failed to update temporary password.', 'Close', { duration: 4000 });
        }
      });
    });
  }

  setSystemStatus(user: User) {
    const isCurrentlyActive = user.systemStatus === 'ACTIVE';
    const newStatus = isCurrentlyActive ? 'DEACTIVATED' : 'ACTIVE';
    const actionText = isCurrentlyActive ? 'Deactivate' : 'Activate';

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: `${actionText} User Account`,
        message: `Are you sure you want to ${actionText.toLowerCase()} user account "${user.name}"?`,
        action: actionText,
        isRed: isCurrentlyActive
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;

      this.userService.setSystemStatus(user.userId!, newStatus).subscribe({
        next: () => {
          this.users.update(users =>
            users.map(u => u.userId === user.userId ? { ...u, systemStatus: newStatus } : u)
          );
          this.snackBar.open(`User "${user.name}" is now ${newStatus.toLowerCase()}.`, 'Close', { duration: 3000 });
        },
        error: err => {
          console.error('Status update failed', err);
          this.snackBar.open(`Failed to ${actionText.toLowerCase()} user.`, 'Close', { duration: 4000 });
        }
      });
    });
  }

  deleteUser(user: User) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '440px',
      data: {
        title: 'Delete User Account',
        message: `Are you sure you want to permanently delete user "${user.name}"?\nNote: Deactivating the user is typically recommended instead of permanent deletion.`,
        action: 'Delete Permanently',
        isRed: true
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;

      this.userService.deleteUser(user.userId!).subscribe({
        next: () => {
          this.users.update(users => users.filter(u => u.userId !== user.userId));
          this.snackBar.open(`User "${user.name}" has been deleted.`, 'Close', { duration: 3000 });
        },
        error: err => {
          console.error('Delete operation failed', err);
          this.snackBar.open('Delete operation failed. Please try again.', 'Close', { duration: 4000 });
        }
      });
    });
  }
}
