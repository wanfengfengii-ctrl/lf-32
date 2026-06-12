import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import { TransmissionEngineService } from '../../services/transmission-engine.service';
import {
  TransmissionEvent,
  SignalType,
  SignalTypeConfig,
  PostStation,
  InterruptionRecord
} from '../../models';

@Component({
  selector: 'app-signal-log',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatIconModule,
    MatDividerModule
  ],
  template: `
    <mat-card class="log-card">
      <mat-card-header>
        <mat-card-title>信号日志</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <mat-list>
          <mat-list-item *ngFor="let entry of logEntries" class="log-entry" [class]="getLogClass(entry)">
            <mat-icon matListItemIcon [color]="getIconColor(entry)" [svgIcon]="''">
              {{ getIconName(entry) }}
            </mat-icon>
            <span matListItemTitle class="log-title">
              <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
              <span class="log-msg">{{ entry.message }}</span>
            </span>
            <span matListItemLine class="log-detail">
              <span *ngIf="entry.signalType" class="signal-tag"
                    [style.border-color]="getSignalColor(entry.signalType)"
                    [style.color]="getSignalColor(entry.signalType)">
                {{ getSignalLabel(entry.signalType) }}
              </span>
              <span *ngIf="entry.delayMs" class="delay-tag">延迟 {{ entry.delayMs }}ms</span>
              <span *ngIf="entry.errorMessage" class="error-tag">{{ entry.errorMessage }}</span>
            </span>
          </mat-list-item>
        </mat-list>

        <div *ngIf="logEntries.length === 0" class="empty-hint">
          等待传讯事件...
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .log-card {
      height: 100%;
      overflow-y: auto;
      background: #1e1e30;
      color: #e0d5c1;
    }
    .log-entry {
      border-radius: 4px;
      margin: 2px 0;
      padding: 4px 8px;
    }
    .log-entry.log-sent { background: rgba(230, 126, 34, 0.1); }
    .log-entry.log-received { background: rgba(39, 174, 96, 0.1); }
    .log-entry.log-failed { background: rgba(231, 76, 60, 0.1); }
    .log-entry.log-interrupted { background: rgba(192, 57, 43, 0.15); }
    .log-entry.log-conflict { background: rgba(241, 196, 15, 0.15); }
    .log-entry.log-interruption { background: rgba(192, 57, 43, 0.1); }
    .log-title {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .log-time {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #8a8aaa;
      min-width: 70px;
    }
    .log-msg {
      font-size: 12px;
    }
    .log-detail {
      font-size: 11px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .signal-tag {
      padding: 1px 6px;
      border-radius: 8px;
      border: 1px solid;
      font-size: 10px;
    }
    .delay-tag {
      color: #8a8aaa;
      font-size: 10px;
    }
    .error-tag {
      color: #e74c3c;
      font-size: 10px;
    }
    .empty-hint {
      text-align: center;
      color: #666;
      font-size: 12px;
      padding: 24px;
    }
  `]
})
export class SignalLogComponent implements OnInit, OnDestroy {
  logEntries: LogEntry[] = [];
  private subs: Subscription[] = [];
  private stationNames = new Map<string, string>();
  private baseTimestamp = 0;

  constructor(
    private readonly stateService: StateService,
    private readonly engineService: TransmissionEngineService
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.stateService.stations$.subscribe(stations => {
        this.stationNames.clear();
        for (const s of stations) {
          this.stationNames.set(s.id, s.name);
        }
      }),
      this.engineService.transmissionEvents$.subscribe(event => {
        this.addEventEntry(event);
      }),
      this.engineService.conflicts$.subscribe(conflict => {
        this.logEntries.push({
          type: 'conflict',
          timestamp: conflict.timestamp,
          message: `冲突: 驿铺 ${this.getStationName(conflict.stationId)}`,
          signalType: conflict.signalType1,
          errorMessage: conflict.message
        });
      }),
      this.engineService.interruptions$.subscribe(interruption => {
        this.logEntries.push({
          type: 'interruption',
          timestamp: interruption.timestamp,
          message: `中断: 驿铺 ${this.getStationName(interruption.stationId)}`,
          errorMessage: interruption.reason
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private addEventEntry(event: TransmissionEvent): void {
    const fromName = this.getStationName(event.fromStationId);
    const toName = this.getStationName(event.toStationId);
    let message = '';

    if (event.status === 'sent') {
      message = `${fromName} 发出信号`;
    } else if (event.status === 'received') {
      message = `${fromName} → ${toName} 信号已送达`;
    } else if (event.status === 'failed') {
      message = `${fromName} → ${toName} 传送失败`;
    } else if (event.status === 'interrupted') {
      message = `${fromName} → ${toName} 传送中断`;
    }

    if (this.logEntries.length === 0) {
      this.baseTimestamp = event.timestamp;
    }

    this.logEntries.push({
      type: event.status,
      timestamp: event.timestamp,
      message,
      signalType: event.signalType,
      delayMs: event.delayMs,
      errorMessage: event.errorMessage
    });
  }

  formatTime(ts: number): string {
    const relative = this.baseTimestamp ? ts - this.baseTimestamp : 0;
    const seconds = Math.floor(relative / 1000);
    const millis = Math.floor((relative % 1000) / 100);
    return `${seconds}.${millis}s`;
  }

  getStationName(id: string): string {
    return this.stationNames.get(id) ?? id.slice(0, 6);
  }

  getLogClass(entry: LogEntry): string {
    return `log-${entry.type}`;
  }

  getIconName(entry: LogEntry): string {
    switch (entry.type) {
      case 'sent': return 'send';
      case 'received': return 'check_circle';
      case 'failed': return 'error';
      case 'interrupted': return 'block';
      case 'conflict': return 'warning';
      case 'interruption': return 'cancel';
      default: return 'info';
    }
  }

  getIconColor(entry: LogEntry): string {
    switch (entry.type) {
      case 'sent': return 'accent';
      case 'received': return 'primary';
      case 'failed': return 'warn';
      case 'interrupted': return 'warn';
      case 'conflict': return 'warn';
      case 'interruption': return 'warn';
      default: return '';
    }
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }

  getSignalColor(type: SignalType): string {
    return SignalTypeConfig[type]?.color ?? '#999';
  }
}

interface LogEntry {
  type: string;
  timestamp: number;
  message: string;
  signalType?: SignalType;
  delayMs?: number;
  errorMessage?: string;
}
