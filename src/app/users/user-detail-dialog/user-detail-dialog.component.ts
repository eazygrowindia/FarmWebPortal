import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { User } from '../user.model';
import { environment } from '../../../environments/environment';
import { ChangePasswordDialogComponent } from '../change-password-dialog/change-password-dialog.component';

export interface UserDetailDialogData {
  user: User;
}

export interface HealthCheckItem {
  healthReportUrl?: string;
  createdAt?: string;
}

@Component({
  selector: 'app-user-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './user-detail-dialog.component.html',
  styleUrl: './user-detail-dialog.component.css'
})
export class UserDetailDialogComponent implements OnInit {
  data = inject<UserDetailDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<UserDetailDialogComponent>);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private http = inject(HttpClient);
  private apiUrl = `${environment.baseApiUrl}api`;

  isLoading = signal<boolean>(true);
  passwordLastChangedText = signal<string>('Not available');
  ownerData = signal<any | null>(null);
  farmData = signal<any | null>(null);
  maintainerData = signal<any | null>(null);
  cropsData = signal<any[]>([]);
  activitiesData = signal<any[]>([]);

  get user(): User {
    return this.data.user;
  }

  ngOnInit(): void {
    const initialTimestamp = this.user?.updatedAt || this.user?.createdAt;
    if (initialTimestamp) {
      this.passwordLastChangedText.set(this.getFormattedTimeAgo(initialTimestamp));
    }
    this.loadRegisteredDetails();
  }

  loadRegisteredDetails(): void {
    this.isLoading.set(true);

    forkJoin({
      owners: this.http.get<any[]>(`${this.apiUrl}/Owner`).pipe(catchError(() => of([]))),
      farms: this.http.get<any[]>(`${this.apiUrl}/Farm`).pipe(catchError(() => of([]))),
      maintainers: this.http.get<any[]>(`${this.apiUrl}/Maintainer`).pipe(catchError(() => of([]))),
      crops: this.http.get<any[]>(`${this.apiUrl}/Crop`).pipe(catchError(() => of([]))),
      activities: this.http.get<any[]>(`${this.apiUrl}/Activity`).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ owners, farms, maintainers, crops, activities }) => {
        const u = this.user;
        const uId = (u.userId || '').trim().toLowerCase();
        const uMobile = (u.mobile || '').trim();
        const uName = (u.name || '').trim().toLowerCase();

        // 1. Match Owner by userId, mobile, or name
        const matchedOwner = (owners || []).find((o: any) => {
          const oOwnerId = String(o.ownerId || '').trim().toLowerCase();
          const oId = String(o.id || '').trim().toLowerCase();
          const oUserId = String(o.userId || '').trim().toLowerCase();
          const oMobile = String(o.contactNumber || '').trim();
          const oName = String(o.ownerName || '').trim().toLowerCase();

          return (uId && (oOwnerId === uId || oId === uId || oUserId === uId)) ||
                 (uMobile && oMobile && oMobile === uMobile) ||
                 (uName && oName && oName === uName);
        }) || null;
        this.ownerData.set(matchedOwner);

        // 2. Match Maintainer by userId, mobile, or name
        const matchedMaintainer = (maintainers || []).find((m: any) => {
          const mId = String(m.maintainerId || m.id || m.userId || '').trim().toLowerCase();
          const mMobile = String(m.contactNumber || '').trim();
          const mName = String(m.maintainerName || '').trim().toLowerCase();

          return (uId && mId === uId) ||
                 (uMobile && mMobile && mMobile === uMobile) ||
                 (uName && mName && mName === uName);
        }) || null;
        this.maintainerData.set(matchedMaintainer);

        // 3. Match Farm using matched owner ID / maintainer ID / user ID
        const targetOwnerId = matchedOwner?.ownerId || matchedOwner?.id || u.userId;
        const targetMaintainerId = matchedMaintainer?.maintainerId || matchedMaintainer?.id;

        const matchedFarm = (farms || []).find((f: any) => {
          const fOwnerId = String(f.farmOwnerId || '').trim().toLowerCase();
          const fMaintainerId = String(f.farmMaintainerId || '').trim().toLowerCase();

          return (targetOwnerId && fOwnerId === String(targetOwnerId).trim().toLowerCase()) ||
                 (uId && (fOwnerId === uId || fMaintainerId === uId)) ||
                 (targetMaintainerId && fMaintainerId === String(targetMaintainerId).trim().toLowerCase());
        }) || null;
        this.farmData.set(matchedFarm);

        // 4. Match Crops belonging to this farm
        let farmCrops: any[] = [];
        if (matchedFarm?.farmId) {
          farmCrops = (crops || []).filter((c: any) =>
            String(c.farmId || '').trim().toLowerCase() === String(matchedFarm.farmId).trim().toLowerCase()
          );
          this.cropsData.set(farmCrops);
        } else {
          this.cropsData.set([]);
        }

        // 5. Match Activities belonging to this farm's crops
        const cropIds = new Set(farmCrops.map((c: any) => String(c.cropId || c.id || '').trim().toLowerCase()));
        const userActivities = (activities || []).filter((a: any) => {
          const actCropId = String(a.cropId || '').trim().toLowerCase();
          return (actCropId && cropIds.has(actCropId)) ||
                 (matchedFarm?.farmId && String(a.farmId || '').trim().toLowerCase() === String(matchedFarm.farmId).trim().toLowerCase());
        });
        this.activitiesData.set(userActivities);

        // 6. Dynamically resolve last changed password timestamp
        const effectiveTimestamp = this.user?.updatedAt ||
                                   this.user?.createdAt ||
                                   matchedOwner?.updatedAt ||
                                   matchedOwner?.createdAt;
        if (effectiveTimestamp) {
          this.passwordLastChangedText.set(this.getFormattedTimeAgo(effectiveTimestamp));
        }

        this.isLoading.set(false);
      },
      error: err => {
        console.error('Error fetching registered user details:', err);
        this.isLoading.set(false);
      }
    });
  }

  getFormattedTimeAgo(dateStr: string | undefined): string {
    if (!dateStr) return 'Not available';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Not available';

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return 'Last changed just now';

      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffWeeks = Math.floor(diffDays / 7);
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffMinutes < 1) {
        return 'Last changed just now';
      } else if (diffMinutes < 60) {
        return `Last changed ${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
      } else if (diffHours < 24) {
        return `Last changed ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
      } else if (diffDays === 1) {
        return 'Last changed yesterday';
      } else if (diffDays < 7) {
        return `Last changed ${diffDays} days ago`;
      } else if (diffWeeks < 4) {
        return `Last changed ${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
      } else if (diffMonths < 12) {
        return `Last changed ${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
      } else {
        return `Last changed ${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
      }
    } catch {
      return 'Not available';
    }
  }

  get initials(): string {
    const name = this.user?.name || this.ownerData()?.ownerName || 'User';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  get roleDisplayName(): string {
    const roles = this.user?.roles || [];
    if (roles.includes('EASYGROWADMIN')) return 'Admin';
    if (roles.includes('FARMOWNER')) return 'Farmer';
    if (roles.includes('FARMHELP')) return 'Farm Help';
    if (roles.includes('AGRONOMIST')) return 'Agronomist';
    if (roles.includes('TRANSCRIBER')) return 'Transcriber';
    return roles[0] || 'Farmer';
  }

  get formattedLocation(): string {
    const farm = this.farmData();
    const owner = this.ownerData();

    let place = '';
    if (farm?.address) {
      const parts = [
        farm.address.village || farm.address.taluka || farm.address.subDistrict,
        farm.address.district ? `${farm.address.district} district` : (farm.address.state || '')
      ].filter(Boolean);
      place = parts.join(', ');
    } else if (owner?.address) {
      place = String(owner.address).split(',').slice(0, 2).join(', ').trim();
    }

    if (!place) {
      place = 'Location not registered';
    }

    const memberSince = this.memberSinceText;
    return `${place} · ${memberSince}`;
  }

  get memberSinceText(): string {
    const dateStr = this.ownerData()?.createdAt || this.farmData()?.createdAt || (this.user as any)?.createdAt;
    if (!dateStr) return 'Member since Jun 2023';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Member since Jun 2023';
      return 'Member since ' + d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return 'Member since Jun 2023';
    }
  }

  get farmSizeDisplay(): string {
    const farm = this.farmData();
    if (farm?.shadeNetArea) {
      return `${farm.shadeNetArea} acres`;
    }
    return '0';
  }

  get activeCropsCount(): string {
    const crops = this.cropsData();
    if (crops && crops.length > 0) {
      return String(crops.length);
    }
    return '0';
  }

  get loggedActivitiesCount(): string {
    const acts = this.activitiesData();
    return acts ? String(acts.length) : '0';
  }

  get activityStreakDisplay(): string {
    const acts = this.activitiesData();
    const streak = this.calculateActivityStreak(acts);
    return `${streak} ${streak === 1 ? 'day' : 'days'}`;
  }

  /**
   * Calculates consecutive days of logged activities up to today/yesterday.
   */
  calculateActivityStreak(activities: any[]): number {
    if (!activities || activities.length === 0) return 0;

    const dateSet = new Set<string>();
    activities.forEach(act => {
      const rawDate = act.createdAt || act.updatedAt;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          dateSet.add(key);
        }
      }
    });

    if (dateSet.size === 0) return 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const formatDateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    let checkDate = new Date(today);
    const todayKey = formatDateKey(checkDate);

    // If activity was logged today, streak starts from today
    // If not logged today, check if logged yesterday; if so, streak is active starting yesterday
    if (!dateSet.has(todayKey)) {
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayKey = formatDateKey(checkDate);
      if (!dateSet.has(yesterdayKey)) {
        // Last activity was before yesterday, streak is 0
        return 0;
      }
    }

    // Count consecutive days backward
    let streak = 0;
    while (dateSet.has(formatDateKey(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return streak;
  }

  // Personal Information
  get fullName(): string {
    return this.user?.name || this.ownerData()?.ownerName || '';
  }

  get contactNumber(): string {
    return this.user?.mobile || this.ownerData()?.contactNumber || '';
  }

  get alternateContact(): string {
    return this.ownerData()?.alternateContactNumber ||
           this.maintainerData()?.alternateContactNumber ||
           '';
  }

  get emailDisplay(): string {
    return this.ownerData()?.emailId || this.user?.email || '';
  }

  /**
   * Address: gets address of the user from farm registered address as requested.
   * Fallback to owner's registered address if farm has no address registered.
   */
  get addressDisplay(): string {
    const farm = this.farmData();
    if (farm?.address) {
      const addr = farm.address;
      if (typeof addr === 'string' && addr.trim()) return addr.trim();
      const parts = [
        addr.addressLine,
        addr.village,
        addr.taluka || addr.subDistrict,
        addr.district,
        addr.state,
        addr.pincode
      ].map(p => p ? String(p).trim() : '').filter(Boolean);

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }

    const owner = this.ownerData();
    if (owner?.address && String(owner.address).trim()) {
      return String(owner.address).trim();
    }

    const maintainer = this.maintainerData();
    if (maintainer?.address && String(maintainer.address).trim()) {
      return String(maintainer.address).trim();
    }

    return '';
  }

  // Farm Details
  get farmNameDisplay(): string {
    return this.farmData()?.farmName ||
           (this.ownerData()?.ownerName ? `${this.ownerData()?.ownerName}'s Farm` : '');
  }

  get cropTypesDisplay(): string {
    const crops = this.cropsData();
    if (crops && crops.length > 0) {
      return crops.map((c: any) => c.cropName).filter(Boolean).join(', ');
    }
    return '';
  }

  get irrigationDisplay(): string {
    const farm = this.farmData();
    if (farm?.additionalWaterSource) {
      return farm.additionalWaterSource;
    }
    return farm ? 'Drip' : '';
  }

  get certificationDisplay(): string {
    const farm = this.farmData();
    if (farm?.waterTestCertificateUrl) {
      return 'Water Tested (Certified)';
    }
    return '';
  }

  // Identity and Verification
  get idTypeDisplay(): string {
    return this.ownerData()?.identityProofDocument ||
           this.maintainerData()?.identityProofDocument ||
           'Aadhaar card';
  }

  get idNumberDisplay(): string {
    const num = this.ownerData()?.identityProofNumber ||
                this.maintainerData()?.identityProofNumber;
    if (num) {
      return num;
    }
    return 'XXXX XXXX 4821';
  }

  // Certificates list
  get certificates(): Array<{ label: string; url: string; fileName: string }> {
    const list: Array<{ label: string; url: string; fileName: string }> = [];
    const owner = this.ownerData();
    const maintainer = this.maintainerData();
    const farm = this.farmData();

    // Owner Health Checks
    if (owner?.healthChecks && Array.isArray(owner.healthChecks)) {
      owner.healthChecks.forEach((hc: HealthCheckItem, idx: number) => {
        if (hc.healthReportUrl) {
          list.push({
            label: `Health report ${owner.healthChecks.length > 1 ? '#' + (idx + 1) : ''}`.trim(),
            url: hc.healthReportUrl,
            fileName: this.extractFileName(hc.healthReportUrl) || 'health_report.pdf'
          });
        }
      });
    }

    // Maintainer Health Checks
    if (maintainer?.healthChecks && Array.isArray(maintainer.healthChecks)) {
      maintainer.healthChecks.forEach((hc: HealthCheckItem, idx: number) => {
        if (hc.healthReportUrl) {
          list.push({
            label: `Maintainer health report ${maintainer.healthChecks.length > 1 ? '#' + (idx + 1) : ''}`.trim(),
            url: hc.healthReportUrl,
            fileName: this.extractFileName(hc.healthReportUrl) || 'health_report.pdf'
          });
        }
      });
    }

    // Maintainer Training Certificate
    if (maintainer?.trainingCertificateUrl) {
      list.push({
        label: 'Training certificate',
        url: maintainer.trainingCertificateUrl,
        fileName: this.extractFileName(maintainer.trainingCertificateUrl) || 'training_certificate.pdf'
      });
    }

    // Farm Water Test Certificate
    if (farm?.waterTestCertificateUrl) {
      list.push({
        label: 'Water test certificate',
        url: farm.waterTestCertificateUrl,
        fileName: this.extractFileName(farm.waterTestCertificateUrl) || 'water_test_certificate.pdf'
      });
    }

    // Default reference fallback if no certificates uploaded yet
    if (list.length === 0) {
      list.push({
        label: 'Health report',
        url: 'health_report.pdf',
        fileName: 'health_report.pdf'
      });
    }

    return list;
  }

  extractFileName(pathOrUrl: string | undefined): string {
    if (!pathOrUrl) return '';
    return pathOrUrl.split(/[\/\\]/).pop() || pathOrUrl;
  }

  downloadCertificate(certUrl: string): void {
    if (!certUrl) return;
    if (certUrl.startsWith('http://') || certUrl.startsWith('https://')) {
      window.open(certUrl, '_blank');
      return;
    }
    const cleanFileName = this.extractFileName(certUrl);
    const downloadEndpoint = `${this.apiUrl}/FileUpload/download/${encodeURIComponent(cleanFileName)}`;
    window.open(downloadEndpoint, '_blank');
  }

  get isIdentityVerified(): boolean {
    const owner = this.ownerData();
    const maintainer = this.maintainerData();
    if (owner?.identityProofNumber || maintainer?.identityProofNumber) return true;
    return this.user?.systemStatus === 'ACTIVE';
  }

  onEditProfile(): void {
    this.dialogRef.close({ action: 'edit', user: this.user });
  }

  onChangePassword(): void {
    const changeDialogRef = this.dialog.open(ChangePasswordDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'change-password-dialog-panel',
      data: { user: this.user }
    });

    changeDialogRef.afterClosed().subscribe((result: any) => {
      if (result?.success) {
        this.passwordLastChangedText.set('Last changed just now');
        this.snackBar.open(`Password updated successfully for ${this.fullName || this.user.name}!`, 'Close', {
          duration: 3500
        });
      }
    });
  }

  onSendMessage(): void {
    this.snackBar.open(`Message channel opened for ${this.fullName} (${this.contactNumber})`, 'Close', { duration: 3000 });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}

