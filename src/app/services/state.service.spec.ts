import { TestBed } from '@angular/core/testing';
import { StateService } from './state.service';
import {
  PostStation,
  StationStatus,
  SignalType,
  TransmissionDirection,
  createPostStation
} from '../models';

describe('StateService', () => {
  let service: StateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StateService);
    service.resetAll();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('驿铺管理', () => {
    it('应该添加驿铺', () => {
      const stations: PostStation[] = [];
      service.stations$.subscribe(s => stations.push(...s));

      service.addStation({
        name: '测试驿',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });

      expect(stations.length).toBeGreaterThan(0);
      expect(stations[stations.length - 1].name).toBe('测试驿');
    });

    it('删除驿铺时应该删除关联的通视关系', () => {
      const station1 = createPostStation({
        name: '驿铺A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿铺B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station3 = createPostStation({
        name: '驿铺C',
        x: 300,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });

      service.addStation(station1);
      service.addStation(station2);
      service.addStation(station3);

      service.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG],
        delayMs: 1000
      });

      service.addLink({
        fromStationId: station2.id,
        toStationId: station3.id,
        direction: TransmissionDirection.BIDIRECTIONAL,
        signalTypes: [SignalType.DRUM, SignalType.LANTERN, SignalType.FLAG],
        delayMs: 1000
      });

      service.addLink({
        fromStationId: station1.id,
        toStationId: station3.id,
        direction: TransmissionDirection.FORWARD,
        signalTypes: [SignalType.DRUM],
        delayMs: 1500
      });

      let links: any[] = [];
      service.visibilityLinks$.subscribe(l => { links = l; });
      expect(links.length).toBe(3);

      service.deleteStation(station2.id);

      expect(links.length).toBe(1);
      expect(links[0].fromStationId).toBe(station1.id);
      expect(links[0].toStationId).toBe(station3.id);
    });

    it('删除起点驿铺时应该重置起点信号确认状态', () => {
      const station = createPostStation({
        name: '起点驿',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station);

      service.setStartStationId(station.id);
      service.setStartSignalType(SignalType.DRUM);
      service.setStartSignalConfirmed(true);

      let confirmed = true;
      service.startSignalConfirmed$.subscribe(c => confirmed = c);
      let startId: string | null = station.id;
      service.startStationId$.subscribe(id => startId = id);

      expect(confirmed).toBe(true);
      expect(startId).toBe(station.id);

      service.deleteStation(station.id);

      expect(confirmed).toBe(false);
      expect(startId).toBeNull();
    });
  });

  describe('起点信号确认机制', () => {
    it('未确认起点信号前不能启动整条链路', () => {
      let confirmed = false;
      service.startSignalConfirmed$.subscribe(c => confirmed = c);
      expect(confirmed).toBe(false);

      service.setStartSignalConfirmed(true);
      expect(confirmed).toBe(true);
    });

    it('更改起点驿铺时应该重置确认状态', () => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station1);
      service.addStation(station2);

      service.setStartStationId(station1.id);
      service.setStartSignalConfirmed(true);

      let confirmed = true;
      service.startSignalConfirmed$.subscribe(c => confirmed = c);
      expect(confirmed).toBe(true);

      service.setStartStationId(station2.id);
      expect(confirmed).toBe(false);
    });
  });

  describe('通视关系管理', () => {
    it('应该正确添加通视关系', () => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station1);
      service.addStation(station2);

      let links: any[] = [];
      service.visibilityLinks$.subscribe(l => { links = l; });

      service.addLink({
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.FORWARD,
        signalTypes: [SignalType.DRUM],
        delayMs: 1000
      });

      expect(links.length).toBe(1);
      expect(links[0].direction).toBe(TransmissionDirection.FORWARD);
      expect(links[0].signalTypes).toContain(SignalType.DRUM);
    });

    it('应该正确删除通视关系', () => {
      const station1 = createPostStation({
        name: '驿A',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      const station2 = createPostStation({
        name: '驿B',
        x: 200,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station1);
      service.addStation(station2);

      service.addLink({
        id: 'link-1',
        fromStationId: station1.id,
        toStationId: station2.id,
        direction: TransmissionDirection.FORWARD,
        signalTypes: [SignalType.DRUM],
        delayMs: 1000
      });

      let links: any[] = [];
      service.visibilityLinks$.subscribe(l => { links = l; });
      expect(links.length).toBe(1);

      service.deleteLink('link-1');
      expect(links.length).toBe(0);
    });
  });

  describe('中断和冲突管理', () => {
    it('应该正确添加中断记录', () => {
      const station = createPostStation({
        name: '测试驿',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station);

      let interruptions: any[] = [];
      service.interruptions$.subscribe(i => { interruptions = i; });

      service.addInterruption({
        stationId: station.id,
        reason: '测试中断',
        timestamp: Date.now()
      });

      expect(interruptions.length).toBe(1);
      expect(interruptions[0].reason).toBe('测试中断');
    });

    it('应该正确添加冲突记录', () => {
      const station = createPostStation({
        name: '测试驿',
        x: 100,
        y: 100,
        status: StationStatus.IDLE,
        interrupted: false
      });
      service.addStation(station);

      let conflicts: any[] = [];
      service.conflicts$.subscribe(c => { conflicts = c; });

      service.addConflict({
        stationId: station.id,
        signalType1: SignalType.DRUM,
        signalType2: SignalType.LANTERN,
        timestamp: Date.now(),
        message: '测试冲突'
      });

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].message).toBe('测试冲突');
    });

    it('重置时应该清除所有中断和冲突', () => {
      service.addInterruption({
        stationId: 'test',
        reason: '测试',
        timestamp: Date.now()
      });
      service.addConflict({
        stationId: 'test',
        signalType1: SignalType.DRUM,
        signalType2: SignalType.LANTERN,
        timestamp: Date.now(),
        message: '测试'
      });

      let interruptions: any[] = [];
      let conflicts: any[] = [];
      service.interruptions$.subscribe(i => { interruptions = i; });
      service.conflicts$.subscribe(c => { conflicts = c; });

      expect(interruptions.length).toBe(1);
      expect(conflicts.length).toBe(1);

      service.resetAll();

      expect(interruptions.length).toBe(0);
      expect(conflicts.length).toBe(0);
    });
  });
});
