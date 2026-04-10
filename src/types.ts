export interface ProjectComponent {
  id: string;
  name: string;
  description: string;
  quantity: number;
  estimatedPriceZAR: number;
  supplier?: string;
  category: 'MCU' | 'Sensor' | 'Actuator' | 'Power' | 'Module' | 'Display' | 'Mechanical' | 'Other';
  datasheetUrl?: string;
}

export interface WiringNode {
  id: string;
  type: string;
  data: { label: string; componentId: string };
  position: { x: number; y: number };
}

export interface WiringEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  prompt: string;
  components: ProjectComponent[];
  wiring: {
    nodes: WiringNode[];
    edges: WiringEdge[];
  };
  instructions: string;
  createdAt: number;
  totalCostZAR: number;
}
