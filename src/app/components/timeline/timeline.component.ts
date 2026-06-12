import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import { TransmissionEngineService } from '../../services/transmission-engine.service';
import {
  TransmissionRecord,
  PlaybackState,
  SignalType,
  SignalTypeConfig
} from '../../models';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatListModule,
    MatTooltipModule
  ],
  template: `
    <mat-card class="timeline-card">
      <mat-card-header>
        <mat-card-title>时间轴</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="progress-section">
          <div class="time-display">
            <span>{{ formatTime(playbackState.currentTime) }}</span>
            <span class="separator">/</span>
            <span>{{ formatTime(playbackState.totalTime) }}</span>
          </div>
          <mat-progress-bar mode="determinate"
                           [value]="progressPercent"
                           [color]="progressColor">
          </mat-progress-bar>
          <div class="state-badge" [class]="getStateBadgeClass()">
            {{ getStateLabel() }}
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="history-section">
          <h4>传讯记录</h4>
          <mat-list>
            <mat-list-item *ngFor="let record of history; let i = index" class="history-item">
              <span matListItemTitle>
                记录 #{{ i + 1 }}
              </span>
              <span matListItemLine class="record-detail">
                起点: {{ getStationNameFromRecord(record) }} |
                信号: {{ getSignalLabel(record.initialSignal) }} |
                事件: {{ record.events.length }} |
                冲突: {{ record.conflicts.length }}
              </span>
              <button mat-icon-button (click)="onReplay(record)"
                      matTooltip="回放此记录"
                      [disabled]="isPlaying || isPaused"
                      color="primary">
                <mat-icon>replay</mat-icon>
              </button>
            </mat-list-item>
          </mat-list>

          <div *ngIf="history.length === 0" class="empty-hint">
            暂无传讯记录
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .timeline-card {
      height: 100%;
      overflow-y: auto;
      background: #1e1e30;
      color: #e0d5c1;
    }
    .progress-section {
      margin: 8px 0 16px;
    }
    .time-display {
      display: flex;
      align-items: baseline;
      gap: 4px;
      font-size: 18px;
      font-family: 'Courier New', monospace;
      color: #c9b896;
      margin-bottom: 8px;
    }
    .separator { color: #666; }
    .state-badge {
      display: inline-block;
      margin-top: 8px;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .state-idle { background: #333; color: #888; }
    .state-playing { background: #27ae60; color: #fff; }
    .state-paused { background: #e67e22; color: #fff; }
    .state-playback { background: #8e44ad; color: #fff; }
    .history-section h4 {
      font-size: 13px;
      font-weight: 500;
      margin: 8px 0;
      color: #c9b896;
    }
    .history-item {
      border-radius: 4px;
    }
    .record-detail {
      font-size: 11px;
      color: #8a8aaa;
    }
    .empty-hint {
      text-align: center;
      color: #666;
      font-size: 12px;
      padding: 16px;
    }
  `]
})
export class TimelineComponent implements OnInit, OnDestroy {
  playbackState: PlaybackState = {
    isPlaying: false,
    isPaused: false,
    speed: 1,
    currentTime: 0,
    totalTime: 0,
    isPlaybackMode: false
  };
  history: TransmissionRecord[] = [];

  private subs: Subscription[] = [];
  private stationNames = new Map<string, string>();

  constructor(
    private readonly stateService: StateService,
    private readonly engineService: TransmissionEngineService
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.stateService.playbackState$.subscribe(ps => this.playbackState = ps),
      this.stateService.transmissionHistory$.subscribe(h => this.history = h),
      this.stateService.stations$.subscribe(stations => {
        this.stationNames.clear();
        for (const s of stations) {
          this.stationNames.set(s.id, s.name);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  get progressPercent(): number {
    if (this.playbackState.totalTime === 0) return 0;
    return Math.min(100, (this.playbackState.currentTime / this.playbackState.totalTime) * 100);
  }

  get progressColor(): string {
    if (this.playbackState.isPaused) return 'warn';
    if (this.playbackState.isPlaying) return 'primary';
    return 'accent';
  }

  get isPlaying(): boolean {
    return this.playbackState.isPlaying;
  }

  get isPaused(): boolean {
    return this.playbackState.isPaused;
  }

  formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const millis = Math.floor((ms % 1000) / 100);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}`;
  }

  getStateBadgeClass(): string {
    if (this.playbackState.isPlaybackMode && this.playbackState.isPlaying) return 'state-playback';
    if (this.playbackState.isPaused) return 'state-paused';
    if (this.playbackState.isPlaying) return 'state-playing';
    return 'state-idle';
  }

  getStateLabel(): string {
    if (this.playbackState.isPlaybackMode && this.playbackState.isPlaying) return '回放中';
    if (this.playbackState.isPaused) return '已暂停';
    if (this.playbackState.isPlaying) return '传讯中';
    return '空闲';
  }

  onReplay(record: TransmissionRecord): void {
    if (this.playbackState.isPlaying || this.playbackState.isPaused) return;
    this.engineService.playback(record).subscribe();
  }

  getStationNameFromRecord(record: TransmissionRecord): string {
    return this.stationNames.get(record.startStationId) ?? '未知';
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }
}
