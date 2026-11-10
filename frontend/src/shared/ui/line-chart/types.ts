export interface ChartPoint {
  date: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  color: string;
  label?: string;
  points: ChartPoint[];
}
