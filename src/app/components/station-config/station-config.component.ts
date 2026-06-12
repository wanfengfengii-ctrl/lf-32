import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { StateService } from '../../services/state.service';
import {
  PostStation,
  VisibilityLink,
  StationStatus,
  SignalType,
  SignalTypeConfig,
  TransmissionDirection
} from '../../models';

@Component({
  selector: 'app-station-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatListModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card class="config-card">
      <mat-card-header>
        <mat-card-title>驿铺配置</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="section">
          <div class="section-header">
            <h3>驿铺节点</h3>
            <button mat-icon-button color="primary" (click)="addStation()" matTooltip="添加驿铺">
              <mat-icon>add</mat-icon>
            </button>
          </div>

          <mat-list>
            <mat-list-item *ngFor="let station of stations" class="station-item"
                          [class.selected]="selectedStationId === station.id"
                          (click)="selectStation(station)">
              <span matListItemTitle>{{ station.name }}</span>
              <span matListItemLine class="station-status" [class]="getStatusClass(station.status)">
                {{ getStatusLabel(station.status) }}
                <span *ngIf="station.currentSignal" class="signal-badge"
                      [style.background-color]="getSignalColor(station.currentSignal)">
                  {{ getSignalLabel(station.currentSignal) }}
                </span>
                <span *ngIf="station.interrupted" class="interrupted-badge">中断</span>
              </span>
              <button mat-icon-button (click)="deleteStation(station.id); $event.stopPropagation()"
                      matTooltip="删除驿铺" color="warn">
                <mat-icon>delete</mat-icon>
              </button>
            </mat-list-item>
          </mat-list>

          <div *ngIf="stations.length === 0" class="empty-hint">
            暂无驿铺，点击 + 添加
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="section">
          <div class="section-header">
            <h3>通视关系</h3>
            <button mat-icon-button color="primary" (click)="addLink()" matTooltip="添加通视关系"
                    [disabled]="stations.length < 2">
              <mat-icon>add</mat-icon>
            </button>
          </div>

          <mat-list>
            <mat-list-item *ngFor="let link of links" class="link-item"
                          [class.selected]="selectedLinkId === link.id">
              <span matListItemTitle>
                {{ getStationName(link.fromStationId) }} → {{ getStationName(link.toStationId) }}
              </span>
              <span matListItemLine class="link-detail">
                {{ getDirectionLabel(link.direction) }} | 延迟 {{ link.delayMs }}ms |
                <span *ngFor="let st of link.signalTypes; let last = last"
                      [style.color]="getSignalColor(st)">
                  {{ getSignalLabel(st) }}{{ last ? '' : '、' }}
                </span>
              </span>
              <button mat-icon-button (click)="deleteLink(link.id)" matTooltip="删除通视" color="warn">
                <mat-icon>delete</mat-icon>
              </button>
            </mat-list-item>
          </mat-list>

          <div *ngIf="links.length === 0" class="empty-hint">
            暂无通视关系，点击 + 添加
          </div>
        </div>
      </mat-card-content>
    </mat-card>

    <ng-template #addStationDialog>
    </ng-template>
  `,
  styles: [`
    .config-card {
      height: 100%;
      overflow-y: auto;
      background: #1e1e30;
      color: #e0d5c1;
    }
    .section { margin-bottom: 16px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-header h3 {
      font-size: 14px;
      font-weight: 500;
      margin: 8px 0;
      color: #c9b896;
    }
    .station-item, .link-item {
      cursor: pointer;
      border-radius: 4px;
      margin: 2px 0;
    }
    .station-item.selected, .link-item.selected {
      background: rgba(241, 196, 15, 0.15);
    }
    .station-status {
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .signal-badge {
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      color: #fff;
    }
    .interrupted-badge {
      background: #c0392b;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      color: #fff;
    }
    .link-detail {
      font-size: 11px;
      color: #8a8aaa;
    }
    .empty-hint {
      text-align: center;
      color: #666;
      font-size: 12px;
      padding: 16px;
    }
    .status-idle { color: #888; }
    .status-transmitting { color: #e67e22; }
    .status-receiving { color: #3498db; }
    .status-confirmed { color: #27ae60; }
    .status-interrupted { color: #e74c3c; }
  `]
})
export class StationConfigComponent implements OnInit, OnDestroy {
  stations: PostStation[] = [];
  links: VisibilityLink[] = [];
  selectedStationId: string | null = null;
  selectedLinkId: string | null = null;

  private subs: Subscription[] = [];
  private stationCounter = 0;

  constructor(
    private readonly stateService: StateService,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.stateService.stations$.subscribe(s => this.stations = s),
      this.stateService.visibilityLinks$.subscribe(l => this.links = l),
      this.stateService.selectedStationId$.subscribe(id => this.selectedStationId = id),
      this.stateService.selectedLinkId$.subscribe(id => this.selectedLinkId = id)
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  addStation(): void {
    this.stationCounter++;
    const names = ['凤鸣驿', '青龙驿', '白虎驿', '朱雀驿', '玄武驿', '临潼驿', '华阴驿', '渭南驿', '咸阳驿', '蓝田驿', '商州驿', '洛南驿'];
    const name = names[(this.stationCounter - 1) % names.length];
    const x = 100 + (this.stations.length % 5) * 180;
    const y = 150 + Math.floor(this.stations.length / 5) * 150;

    this.stateService.addStation({
      name,
      x,
      y,
      status: StationStatus.IDLE,
      interrupted: false
    });
  }

  deleteStation(id: string): void {
    const station = this.stations.find(s => s.id === id);
    if (!station) return;

    const relatedLinks = this.links.filter(
      l => l.fromStationId === id || l.toStationId === id
    );

    this.stateService.deleteStation(id);

    if (relatedLinks.length > 0) {
      this.snackBar.open(
        `已删除驿铺「${station.name}」及其 ${relatedLinks.length} 条通视关系`,
        '确定',
        { duration: 3000 }
      );
    }
  }

  selectStation(station: PostStation): void {
    this.stateService.selectStation(station.id);
  }

  addLink(): void {
    if (this.stations.length < 2) return;

    const existing = new Set(this.links.map(l => `${l.fromStationId}-${l.toStationId}`));
    let fromId = this.stations[0].id;
    let toId = this.stations[1].id;

    for (let i = 0; i < this.stations.length; i++) {
      for (let j = i + 1; j < this.stations.length; j++) {
        const key1 = `${this.stations[i].id}-${this.stations[j].id}`;
        const key2 = `${this.stations[j].id}-${this.stations[i].id}`;
        if (!existing.has(key1) && !existing.has(key2)) {
          fromId = this.stations[i].id;
          toId = this.stations[j].id;
          break;
        }
      }
    }

    this.stateService.addLink({
      fromStationId: fromId,
      toStationId: toId,
      direction: TransmissionDirection.BIDIRECTIONAL,
      signalTypes: [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG],
      delayMs: 1000
    });
  }

  deleteLink(id: string): void {
    this.stateService.deleteLink(id);
  }

  getStationName(id: string): string {
    return this.stations.find(s => s.id === id)?.name ?? '未知';
  }

  getStatusClass(status: StationStatus): string {
    return `status-${status.toLowerCase()}`;
  }

  getStatusLabel(status: StationStatus): string {
    const map: Record<StationStatus, string> = {
      [StationStatus.IDLE]: '空闲',
      [StationStatus.TRANSMITTING]: '发送中',
      [StationStatus.RECEIVING]: '接收中',
      [StationStatus.INTERRUPTED]: '已中断',
      [StationStatus.CONFIRMED]: '已确认'
    };
    return map[status] ?? status;
  }

  getSignalLabel(type: SignalType): string {
    return SignalTypeConfig[type]?.label ?? type;
  }

  getSignalColor(type: SignalType): string {
    return SignalTypeConfig[type]?.color ?? '#999';
  }

  getDirectionLabel(dir: TransmissionDirection): string {
    const map: Record<TransmissionDirection, string> = {
      [TransmissionDirection.FORWARD]: '单向→',
      [TransmissionDirection.BACKWARD]: '←单向',
      [TransmissionDirection.BIDIRECTIONAL]: '双向'
    };
    return map[dir] ?? dir;
  }
}
