import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import { TransmissionEngineService } from '../../services/transmission-engine.service';
import {
  PostStation,
  SignalType,
  SignalTypeConfig,
  StationStatus,
  PlaybackState,
  PlaybackSpeed,
  VisibilityLink,
  TransmissionDirection
} from '../../models';

@Component({
  selector: 'app-transmission-control',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatInputModule,
    MatCheckboxModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  template: `
    <mat-card class="control-card">
      <mat-card-header>
        <mat-card-title>传讯控制</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="control-section">
          <h4>起点配置</h4>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>起点驿铺</mat-label>
            <mat-select [(ngModel)]="startStationId"
                        (ngModelChange)="onStartStationChange($event)"
                        [disabled]="isPlaying">
              <mat-option *ngFor="let s of activeStations" [value]="s.id">
                {{ s.name }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>信号类型</mat-label>
            <mat-select [(ngModel)]="startSignalType"
                        (ngModelChange)="onSignalTypeChange($event)"
                        [disabled]="isPlaying">
              <mat-option *ngFor="let st of signalTypes" [value]="st">
                <span [style.color]="getSignalColor(st)">{{ getSignalLabel(st) }}</span>
              </mat-option>
            </mat-select>
          </mat-form-field>

          <div class="confirm-row">
            <mat-checkbox [(ngModel)]="startSignalConfirmed"
                          (ngModelChange)="onConfirmChange($event)"
                          [disabled]="!startStationId || !startSignalType || isPlaying"
                          color="primary">
              确认起点信号
            </mat-checkbox>
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="control-section">
          <h4>播控</h4>
          <div class="playback-buttons">
            <button mat-raised-button color="primary"
                    (click)="onStart()"
                    [disabled]="!canStart"
                    matTooltip="启动传讯">
              <mat-icon>play_arrow</mat-icon> 启动
            </button>
            <button mat-raised-button color="accent"
                    (click)="onPause()"
                    [disabled]="!isPlaying || isPaused"
                    matTooltip="暂停">
              <mat-icon>pause</mat-icon> 暂停
            </button>
            <button mat-raised-button
                    (click)="onResume()"
                    [disabled]="!isPaused"
                    matTooltip="继续">
              <mat-icon>play_arrow</mat-icon> 继续
            </button>
            <button mat-raised-button color="warn"
                    (click)="onStop()"
                    [disabled]="!isPlaying && !isPaused"
                    matTooltip="停止">
              <mat-icon>stop</mat-icon> 停止
            </button>
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="control-section">
          <h4>速度</h4>
          <mat-button-toggle-group [(ngModel)]="speed" (ngModelChange)="onSpeedChange($event)">
            <mat-button-toggle [value]="1">1x</mat-button-toggle>
            <mat-button-toggle [value]="2">2x</mat-button-toggle>
            <mat-button-toggle [value]="4">4x</mat-button-toggle>
            <mat-button-toggle [value]="8">8x</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <mat-divider></mat-divider>

        <div class="control-section">
          <h4>中断操作</h4>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>选择驿铺</mat-label>
            <mat-select [(ngModel)]="interruptStationId">
              <mat-option *ngFor="let s of stations" [value]="s.id">
                {{ s.name }}
                <span *ngIf="s.interrupted" style="color:#e74c3c">(已中断)</span>
              </mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>中断原因</mat-label>
            <input matInput [(ngModel)]="interruptReason" placeholder="输入中断原因">
          </mat-form-field>
          <button mat-raised-button color="warn"
                  (click)="onInterrupt()"
                  [disabled]="!interruptStationId || !interruptReason || (!isPlaying && !isPaused)">
            <mat-icon>block</mat-icon> 中断驿铺
          </button>
        </div>

        <mat-divider></mat-divider>

        <div class="control-section" *ngIf="conflicts.length > 0">
          <h4 class="conflict-title">冲突警告</h4>
          <div *ngFor="let c of conflicts" class="conflict-item">
            <mat-icon color="warn">warning</mat-icon>
            <span>{{ c.message }}</span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .control-card {
      height: 100%;
      overflow-y: auto;
      background: #1e1e30;
      color: #e0d5c1;
    }
    .control-section {
      margin-bottom: 12px;
    }
    .control-section h4 {
      font-size: 13px;
      font-weight: 500;
      margin: 8px 0;
      color: #c9b896;
    }
    .full-width { width: 100%; }
    .confirm-row {
      margin: 8px 0;
    }
    .playback-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .playback-buttons button {
      flex: 1;
      min-width: 60px;
    }
    .conflict-title {
      color: #e74c3c !important;
    }
    .conflict-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 12px;
      color: #e74c3c;
      background: rgba(231, 76, 60, 0.1);
      border-radius: 4px;
      padding: 8px;
      margin: 4px 0;
    }
  `]
})
export class TransmissionControlComponent implements OnInit, OnDestroy {
  stations: PostStation[] = [];
  links: VisibilityLink[] = [];
  startStationId: string | null = null;
  startSignalType: SignalType | null = null;
  startSignalConfirmed = false;
  isPlaying = false;
  isPaused = false;
  speed: PlaybackSpeed = 1;
  interruptStationId: string | null = null;
  interruptReason = '';
  conflicts: { stationId: string; signalType1: SignalType; signalType2: SignalType; timestamp: number; message: string; }[] = [];

  signalTypes: SignalType[] = [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG];

  private subs: Subscription[] = [];

  constructor(
    private readonly stateService: StateService,
    private readonly engineService: TransmissionEngineService,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.stateService.stations$.subscribe(s => this.stations = s),
      this.stateService.visibilityLinks$.subscribe(l => this.links = l),
      this.stateService.startStationId$.subscribe(id => this.startStationId = id),
      this.stateService.startSignalType$.subscribe(t => this.startSignalType = t),
      this.stateService.startSignalConfirmed$.subscribe(c => this.startSignalConfirmed = c),
      this.stateService.playbackState$.subscribe(ps => {
        this.isPlaying = ps.isPlaying;
        this.isPaused = ps.isPaused;
        this.speed = ps.speed;
      }),
      this.engineService.conflicts$.subscribe(c => {
        this.conflicts = [...this.conflicts, c];
        this.snackBar.open(`冲突: ${c.message}`, '确定', { duration: 5000 });
      }),
      this.engineService.errors$.subscribe(err => {
        this.snackBar.open(err, '确定', { duration: 3000 });
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  get activeStations(): PostStation[] {
    return this.stations.filter(s => !s.interrupted);
  }

  get canStart(): boolean {
    return this.startSignalConfirmed && !this.isPlaying && !this.isPaused;
  }

  onStartStationChange(id: string | null): void {
    this.stateService.setStartStationId(id);
  }

  onSignalTypeChange(type: SignalType | null): void {
    this.stateService.setStartSignalType(type);
  }

  onConfirmChange(confirmed: boolean): void {
    this.stateService.setStartSignalConfirmed(confirmed);
  }

  onStart(): void {
    this.conflicts = [];
    this.engineService.startTransmission().subscribe();
  }

  onPause(): void {
    this.engineService.pause();
  }

  onResume(): void {
    this.engineService.resume();
  }

  onStop(): void {
    this.engineService.stop();
  }

  onSpeedChange(speed: PlaybackSpeed): void {
    this.engineService.setSpeed(speed);
  }

  onInterrupt(): void {
    if (!this.interruptStationId || !this.interruptReason) return;
    this.engineService.interruptStation(this.interruptStationId, this.interruptReason);
    this.interruptStationId = null;
    this.interruptReason = '';
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }

  getSignalColor(type: SignalType): string {
    return SignalTypeConfig[type]?.color ?? '#999';
  }
}
