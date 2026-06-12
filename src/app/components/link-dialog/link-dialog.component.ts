import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import {
  PostStation,
  VisibilityLink,
  SignalType,
  SignalTypeConfig,
  TransmissionDirection
} from '../../models';

export interface LinkDialogData {
  stations: PostStation[];
  link?: VisibilityLink;
}

@Component({
  selector: 'app-link-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? '编辑通视关系' : '添加通视关系' }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>起始驿铺</mat-label>
        <mat-select [(ngModel)]="fromStationId" [disabled]="isEdit">
          <mat-option *ngFor="let s of data.stations" [value]="s.id">{{ s.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>目标驿铺</mat-label>
        <mat-select [(ngModel)]="toStationId" [disabled]="isEdit">
          <mat-option *ngFor="let s of data.stations" [value]="s.id">{{ s.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>传递方向</mat-label>
        <mat-select [(ngModel)]="direction">
          <mat-option [value]="TransmissionDirection.FORWARD">单向 →</mat-option>
          <mat-option [value]="TransmissionDirection.BACKWARD">← 单向</mat-option>
          <mat-option [value]="TransmissionDirection.BIDIRECTIONAL">双向</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>信号延迟 (ms)</mat-label>
        <input matInput type="number" [(ngModel)]="delayMs" min="100" step="100">
      </mat-form-field>

      <div class="signal-chips">
        <label>支持信号类型：</label>
        <mat-chip-set>
          <mat-chip *ngFor="let st of allSignalTypes"
                    [selected]="selectedSignalTypes.includes(st)"
                    (click)="toggleSignalType(st)"
                    [style.background-color]="selectedSignalTypes.includes(st) ? getSignalColor(st) : '#333'"
                    [style.color]="selectedSignalTypes.includes(st) ? '#fff' : '#aaa'">
            {{ getSignalLabel(st) }}
          </mat-chip>
        </mat-chip-set>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>取消</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="!canSave">
        {{ isEdit ? '保存' : '添加' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .signal-chips {
      margin: 12px 0;
    }
    .signal-chips label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      color: #aaa;
    }
  `]
})
export class LinkDialogComponent {
  fromStationId: string;
  toStationId: string;
  direction: TransmissionDirection = TransmissionDirection.BIDIRECTIONAL;
  delayMs = 1000;
  selectedSignalTypes: SignalType[] = [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG];
  allSignalTypes = [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG];
  TransmissionDirection = TransmissionDirection;
  isEdit: boolean;

  constructor(
    public dialogRef: MatDialogRef<LinkDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: LinkDialogData
  ) {
    if (data.link) {
      this.isEdit = true;
      this.fromStationId = data.link.fromStationId;
      this.toStationId = data.link.toStationId;
      this.direction = data.link.direction;
      this.delayMs = data.link.delayMs;
      this.selectedSignalTypes = [...data.link.signalTypes];
    } else {
      this.isEdit = false;
      this.fromStationId = data.stations[0]?.id ?? '';
      this.toStationId = data.stations[1]?.id ?? '';
    }
  }

  get canSave(): boolean {
    return !!this.fromStationId && !!this.toStationId &&
           this.fromStationId !== this.toStationId &&
           this.selectedSignalTypes.length > 0 &&
           this.delayMs >= 100;
  }

  toggleSignalType(st: SignalType): void {
    const idx = this.selectedSignalTypes.indexOf(st);
    if (idx >= 0) {
      this.selectedSignalTypes.splice(idx, 1);
    } else {
      this.selectedSignalTypes.push(st);
    }
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }

  getSignalColor(type: SignalType): string {
    return SignalTypeConfig[type]?.color ?? '#999';
  }

  onSave(): void {
    this.dialogRef.close({
      fromStationId: this.fromStationId,
      toStationId: this.toStationId,
      direction: this.direction,
      delayMs: this.delayMs,
      signalTypes: [...this.selectedSignalTypes]
    });
  }
}
