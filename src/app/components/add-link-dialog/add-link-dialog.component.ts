import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import {
  PostStation,
  VisibilityLink,
  SignalType,
  SignalTypeConfig,
  TransmissionDirection
} from '../../models';

export interface AddLinkDialogData {
  stations: PostStation[];
  existingLinks: VisibilityLink[];
}

@Component({
  selector: 'app-add-link-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSelectModule,
    MatInputModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>添加通视关系</h2>
    <mat-dialog-content>
      <div class="form-field">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>起点驿铺</mat-label>
          <mat-select [(ngModel)]="fromStationId" (ngModelChange)="onStationChange()">
            <mat-option *ngFor="let s of data.stations" [value]="s.id">
              {{ s.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="form-field">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>终点驿铺</mat-label>
          <mat-select [(ngModel)]="toStationId" (ngModelChange)="onStationChange()">
            <mat-option *ngFor="let s of availableToStations" [value]="s.id">
              {{ s.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="form-field">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>传递方向</mat-label>
          <mat-select [(ngModel)]="direction">
            <mat-option [value]="TransmissionDirection.FORWARD">单向 (起点 → 终点)</mat-option>
            <mat-option [value]="TransmissionDirection.BACKWARD">单向 (终点 → 起点)</mat-option>
            <mat-option [value]="TransmissionDirection.BIDIRECTIONAL">双向</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="form-field">
        <label class="section-label">支持的信号类型</label>
        <div class="signal-options">
          <mat-checkbox *ngFor="let st of allSignalTypes"
                        [(ngModel)]="selectedSignalTypes[st]"
                        (change)="onSignalTypeChange()">
            <span [style.color]="getSignalColor(st)">{{ getSignalLabel(st) }}</span>
          </mat-checkbox>
        </div>
      </div>

      <div class="form-field">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>信号延迟 (毫秒)</mat-label>
          <input matInput type="number" [(ngModel)]="delayMs" min="100" step="100">
        </mat-form-field>
      </div>

      <div *ngIf="hasError" class="error-message">
        {{ errorMessage }}
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">取消</button>
      <button mat-raised-button color="primary" (click)="onConfirm()" [disabled]="!isValid">
        确认添加
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 320px;
    }
    .form-field {
      margin-bottom: 12px;
    }
    .full-width {
      width: 100%;
    }
    .section-label {
      display: block;
      font-size: 12px;
      color: #999;
      margin-bottom: 6px;
    }
    .signal-options {
      display: flex;
      gap: 16px;
      padding: 4px 0;
    }
    .error-message {
      color: #e74c3c;
      font-size: 12px;
      padding: 8px;
      background: rgba(231, 76, 60, 0.1);
      border-radius: 4px;
      margin-top: 8px;
    }
  `]
})
export class AddLinkDialogComponent {
  readonly TransmissionDirection = TransmissionDirection;
  readonly allSignalTypes: SignalType[] = [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG];

  fromStationId: string | null = null;
  toStationId: string | null = null;
  direction: TransmissionDirection = TransmissionDirection.BIDIRECTIONAL;
  selectedSignalTypes: Record<SignalType, boolean> = {
    [SignalType.DRUM]: true,
    [SignalType.LANTERN]: true,
    [SignalType.FLAG]: true
  };
  delayMs: number = 1000;
  hasError = false;
  errorMessage = '';

  constructor(
    private readonly dialogRef: MatDialogRef<AddLinkDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddLinkDialogData
  ) {
    if (this.data.stations.length >= 2) {
      this.fromStationId = this.data.stations[0].id;
      this.toStationId = this.data.stations[1].id;
    }
  }

  get availableToStations(): PostStation[] {
    if (!this.fromStationId) return this.data.stations;
    return this.data.stations.filter(s => s.id !== this.fromStationId);
  }

  get isValid(): boolean {
    if (!this.fromStationId || !this.toStationId) return false;
    if (this.fromStationId === this.toStationId) return false;
    const signalTypes = this.getSelectedSignalTypes();
    if (signalTypes.length === 0) return false;
    if (this.delayMs < 100) return false;
    if (this.linkAlreadyExists()) return false;
    return true;
  }

  getSelectedSignalTypes(): SignalType[] {
    return this.allSignalTypes.filter(st => this.selectedSignalTypes[st]);
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }

  getSignalColor(type: SignalType): string {
    return SignalTypeConfig[type]?.color ?? '#999';
  }

  onStationChange(): void {
    this.hasError = false;
    if (this.fromStationId && this.toStationId && this.fromStationId === this.toStationId) {
      this.toStationId = null;
    }
    if (this.linkAlreadyExists()) {
      this.hasError = true;
      this.errorMessage = '该通视关系已存在';
    }
  }

  onSignalTypeChange(): void {
    this.hasError = false;
    if (this.getSelectedSignalTypes().length === 0) {
      this.hasError = true;
      this.errorMessage = '请至少选择一种信号类型';
    }
  }

  linkAlreadyExists(): boolean {
    if (!this.fromStationId || !this.toStationId) return false;
    return this.data.existingLinks.some(
      l => (l.fromStationId === this.fromStationId && l.toStationId === this.toStationId) ||
           (l.fromStationId === this.toStationId && l.toStationId === this.fromStationId)
    );
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    if (!this.isValid || !this.fromStationId || !this.toStationId) return;

    const result: Omit<VisibilityLink, 'id'> = {
      fromStationId: this.fromStationId,
      toStationId: this.toStationId,
      direction: this.direction,
      signalTypes: this.getSelectedSignalTypes(),
      delayMs: this.delayMs
    };

    this.dialogRef.close(result);
  }
}
