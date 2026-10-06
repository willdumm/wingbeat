export interface AnalyticFlight {
  id: number;
  start_time: number;
  end_time: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
}

export interface AnalyticPoint {
  lat: number;
  lon: number;
  flight_id: number;
}

export interface RegionHours {
  [region: string]: number;
}
