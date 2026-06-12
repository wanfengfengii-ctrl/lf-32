import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import cytoscape, { Core, NodeSingular } from 'cytoscape';
import { StateService } from '../../services/state.service';
import { TransmissionEngineService } from '../../services/transmission-engine.service';
import {
  PostStation,
  VisibilityLink,
  StationStatus,
  SignalType,
  SignalTypeConfig,
  TransmissionDirection,
  TransmissionEvent
} from '../../models';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #cyContainer class="cy-container"></div>
  `,
  styles: [`
    .cy-container {
      width: 100%;
      height: 100%;
      min-height: 400px;
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      border-radius: 8px;
      overflow: hidden;
    }
  `]
})
export class GraphViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) cyContainer!: ElementRef<HTMLDivElement>;
  private cy!: Core;
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly stateService: StateService,
    private readonly engineService: TransmissionEngineService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.stateService.stations$.subscribe(stations => {
        if (this.cy) {
          this.updateNodes(stations);
        }
      }),
      this.stateService.visibilityLinks$.subscribe(links => {
        if (this.cy) {
          this.updateEdges(links);
        }
      }),
      this.engineService.transmissionEvents$.subscribe(event => {
        if (this.cy) {
          this.handleTransmissionEvent(event);
        }
      }),
      this.stateService.selectedStationId$.subscribe(id => {
        if (this.cy) {
          this.cy.nodes().removeClass('selected');
          if (id) {
            this.cy.$(`#${id}`).addClass('selected');
          }
        }
      })
    );
  }

  ngAfterViewInit(): void {
    this.initCytoscape();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    if (this.cy) {
      this.cy.destroy();
    }
  }

  private initCytoscape(): void {
    const stations = this.stateService['stationsSubject'].value as PostStation[];
    const links = this.stateService['visibilityLinksSubject'].value as VisibilityLink[];

    this.cy = cytoscape({
      container: this.cyContainer.nativeElement,
      elements: [
        ...stations.map(s => ({
          data: { id: s.id, label: s.name, status: s.status, signal: s.currentSignal, interrupted: s.interrupted },
          position: { x: s.x * 2, y: s.y * 2 }
        })),
        ...links.map(l => ({
          data: {
            id: l.id,
            source: l.fromStationId,
            target: l.toStationId,
            direction: l.direction,
            signalTypes: l.signalTypes,
            delayMs: l.delayMs
          }
        }))
      ],
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'color': '#e0d5c1',
            'text-outline-width': 2,
            'text-outline-color': '#1a1a2e',
            'width': 40,
            'height': 40,
            'shape': 'round-rectangle',
            'background-color': '#3a3a5c',
            'border-width': 2,
            'border-color': '#5a5a8c',
            'font-family': 'Roboto, "Noto Sans SC", sans-serif',
            'text-wrap': 'wrap',
            'text-max-width': '80px'
          }
        },
        {
          selector: 'node.status-transmitting',
          style: {
            'background-color': '#e67e22',
            'border-color': '#f39c12',
            'border-width': 3
          }
        },
        {
          selector: 'node.status-receiving',
          style: {
            'background-color': '#3498db',
            'border-color': '#2980b9',
            'border-width': 3
          }
        },
        {
          selector: 'node.status-confirmed',
          style: {
            'background-color': '#27ae60',
            'border-color': '#2ecc71',
            'border-width': 3
          }
        },
        {
          selector: 'node.status-interrupted',
          style: {
            'background-color': '#c0392b',
            'border-color': '#e74c3c',
            'border-width': 3,
            'shape': 'diamond'
          }
        },
        {
          selector: 'node.selected',
          style: {
            'border-width': 4,
            'border-color': '#f1c40f'
          }
        },
        {
          selector: 'node.start-station',
          style: {
            'border-width': 4,
            'border-color': '#f1c40f',
            'border-style': 'double'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#4a4a6a',
            'target-arrow-color': '#4a4a6a',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'label': 'data(delayMs)',
            'font-size': '10px',
            'color': '#8a8aaa',
            'text-rotation': 'autorotate',
            'text-outline-width': 1,
            'text-outline-color': '#1a1a2e',
            'text-background-color': '#1a1a2e',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px'
          }
        },
        {
          selector: 'edge.direction-bidirectional',
          style: {
            'source-arrow-shape': 'triangle',
            'source-arrow-color': '#4a4a6a'
          }
        },
        {
          selector: 'edge.direction-backward',
          style: {
            'target-arrow-shape': 'none',
            'source-arrow-shape': 'triangle',
            'source-arrow-color': '#4a4a6a'
          }
        },
        {
          selector: 'edge.signal-active',
          style: {
            'width': 4,
            'line-color': '#f39c12',
            'target-arrow-color': '#f39c12',
            'source-arrow-color': '#f39c12'
          }
        },
        {
          selector: 'edge.signal-drum',
          style: {
            'line-color': '#8B4513',
            'target-arrow-color': '#8B4513',
            'source-arrow-color': '#8B4513',
            'width': 3,
            'line-style': 'dashed'
          }
        },
        {
          selector: 'edge.signal-lantern',
          style: {
            'line-color': '#FF6347',
            'target-arrow-color': '#FF6347',
            'source-arrow-color': '#FF6347',
            'width': 3,
            'line-style': 'solid'
          }
        },
        {
          selector: 'edge.signal-flag',
          style: {
            'line-color': '#4169E1',
            'target-arrow-color': '#4169E1',
            'source-arrow-color': '#4169E1',
            'width': 3,
            'line-style': 'dotted'
          }
        }
      ],
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.3,
      maxZoom: 3
    });

    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      this.stateService.selectStation(node.id());
    });

    this.cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      this.stateService.selectLink(edge.id());
    });

    this.cy.on('dragfree', 'node', (evt) => {
      const node = evt.target;
      const pos = node.position();
      this.stateService.updateStation(node.id(), {
        x: pos.x / 2,
        y: pos.y / 2
      });
    });

    this.updateNodeClasses();
  }

  private updateNodes(stations: PostStation[]): void {
    if (!this.cy) return;

    const existingIds = new Set(this.cy.nodes().map(n => n.id()));
    const newIds = new Set(stations.map(s => s.id));

    for (const station of stations) {
      if (!existingIds.has(station.id)) {
        this.cy.add({
          data: { id: station.id, label: station.name, status: station.status, signal: station.currentSignal, interrupted: station.interrupted },
          position: { x: station.x * 2, y: station.y * 2 }
        });
      } else {
        const node = this.cy.$(`#${station.id}`);
        node.data('label', station.name);
        node.data('status', station.status);
        node.data('signal', station.currentSignal);
        node.data('interrupted', station.interrupted);
      }
    }

    const toRemove = [...existingIds].filter(id => !newIds.has(id));
    for (const id of toRemove) {
      this.cy.$(`#${id}`).remove();
    }

    this.updateNodeClasses();
  }

  private updateEdges(links: VisibilityLink[]): void {
    if (!this.cy) return;

    const existingIds = new Set(this.cy.edges().map(e => e.id()));
    const newIds = new Set(links.map(l => l.id));

    for (const link of links) {
      if (!existingIds.has(link.id)) {
        this.cy.add({
          data: {
            id: link.id,
            source: link.fromStationId,
            target: link.toStationId,
            direction: link.direction,
            signalTypes: link.signalTypes,
            delayMs: link.delayMs
          }
        });
      } else {
        const edge = this.cy.$(`#${link.id}`);
        edge.data('direction', link.direction);
        edge.data('signalTypes', link.signalTypes);
        edge.data('delayMs', link.delayMs);
      }
    }

    const toRemove = [...existingIds].filter(id => !newIds.has(id));
    for (const id of toRemove) {
      this.cy.$(`#${id}`).remove();
    }

    this.updateEdgeClasses();
  }

  private updateNodeClasses(): void {
    if (!this.cy) return;

    const stations = this.stateService['stationsSubject'].value as PostStation[];
    for (const station of stations) {
      const node = this.cy.$(`#${station.id}`);
      if (node.length > 0) {
        node.removeClass('status-transmitting status-receiving status-confirmed status-interrupted');
        if (station.status === StationStatus.TRANSMITTING) node.addClass('status-transmitting');
        else if (station.status === StationStatus.RECEIVING) node.addClass('status-receiving');
        else if (station.status === StationStatus.CONFIRMED) node.addClass('status-confirmed');
        else if (station.status === StationStatus.INTERRUPTED) node.addClass('status-interrupted');
      }
    }

    const startId = this.stateService['startStationIdSubject'].value as string | null;
    this.cy.nodes().removeClass('start-station');
    if (startId) {
      this.cy.$(`#${startId}`).addClass('start-station');
    }
  }

  private updateEdgeClasses(): void {
    if (!this.cy) return;

    const links = this.stateService['visibilityLinksSubject'].value as VisibilityLink[];
    for (const link of links) {
      const edge = this.cy.$(`#${link.id}`);
      if (edge.length > 0) {
        edge.removeClass('direction-bidirectional direction-backward');
        if (link.direction === TransmissionDirection.BIDIRECTIONAL) edge.addClass('direction-bidirectional');
        else if (link.direction === TransmissionDirection.BACKWARD) edge.addClass('direction-backward');
      }
    }
  }

  private handleTransmissionEvent(event: TransmissionEvent): void {
    if (!this.cy) return;

    if (event.status === 'received' || event.status === 'sent') {
      const links = this.stateService['visibilityLinksSubject'].value as VisibilityLink[];
      const activeLink = links.find(l =>
        l.fromStationId === event.fromStationId && l.toStationId === event.toStationId
      );
      if (activeLink) {
        const edge = this.cy.$(`#${activeLink.id}`);
        const signalClass = `signal-${event.signalType.toLowerCase()}`;
        edge.addClass(signalClass);
        edge.addClass('signal-active');

        setTimeout(() => {
          edge.removeClass(signalClass);
          edge.removeClass('signal-active');
        }, 2000);
      }
    }

    this.updateNodeClasses();
  }
}
