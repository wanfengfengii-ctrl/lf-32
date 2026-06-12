import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { StateService } from './services/state.service';
import { GraphViewComponent } from './components/graph-view/graph-view.component';
import { StationConfigComponent } from './components/station-config/station-config.component';
import { TransmissionControlComponent } from './components/transmission-control/transmission-control.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { SignalLogComponent } from './components/signal-log/signal-log.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatSnackBarModule,
    GraphViewComponent,
    StationConfigComponent,
    TransmissionControlComponent,
    TimelineComponent,
    SignalLogComponent
  ],
  template: `
    <div class="app-container">
      <mat-toolbar class="app-toolbar" color="primary">
        <mat-icon class="toolbar-icon">campaign</mat-icon>
        <span class="toolbar-title">古代驿铺夜间传讯模拟</span>
        <span class="toolbar-spacer"></span>
        <button mat-icon-button (click)="loadDemo()" matTooltip="加载示例数据">
          <mat-icon>science</mat-icon>
        </button>
        <button mat-icon-button (click)="resetAll()" matTooltip="重置所有">
          <mat-icon>restart_alt</mat-icon>
        </button>
      </mat-toolbar>

      <div class="main-content">
        <div class="left-panel">
          <app-station-config></app-station-config>
        </div>

        <div class="center-panel">
          <div class="graph-area">
            <app-graph-view></app-graph-view>
          </div>
          <div class="timeline-area">
            <app-timeline></app-timeline>
          </div>
        </div>

        <div class="right-panel">
          <div class="control-area">
            <app-transmission-control></app-transmission-control>
          </div>
          <div class="log-area">
            <app-signal-log></app-signal-log>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: #0f0f1a;
    }
    .app-toolbar {
      background: linear-gradient(135deg, #1a1a2e, #16213e) !important;
      border-bottom: 1px solid #2a2a4a;
    }
    .toolbar-icon {
      margin-right: 12px;
      color: #f1c40f;
    }
    .toolbar-title {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 2px;
      color: #c9b896;
    }
    .toolbar-spacer { flex: 1; }
    .main-content {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: 8px;
      padding: 8px;
    }
    .left-panel {
      width: 260px;
      min-width: 220px;
      overflow-y: auto;
    }
    .center-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .graph-area {
      flex: 1;
      min-height: 0;
      border-radius: 8px;
      overflow: hidden;
    }
    .timeline-area {
      height: 180px;
      min-height: 140px;
    }
    .right-panel {
      width: 300px;
      min-width: 260px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .control-area {
      flex: 1;
      overflow-y: auto;
    }
    .log-area {
      height: 280px;
      min-height: 200px;
    }
  `]
})
export class AppComponent implements OnInit {
  title = '古代驿铺夜间传讯模拟';

  constructor(private readonly stateService: StateService) {}

  ngOnInit(): void {
    this.loadDemo();
  }

  loadDemo(): void {
    this.stateService.resetAll();
    this.stateService.initDemoData();
  }

  resetAll(): void {
    this.stateService.resetAll();
  }
}
