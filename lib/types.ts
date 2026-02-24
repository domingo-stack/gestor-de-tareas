export type TeamMember = {
    user_id: string;
    email: string;
    role: string;
  };
  
  export type ProjectMember = {
    user_id: string;
    email: string;
  };
  
  export type Collaborator = {
    user_id: string;
    email: string;
  };
  
  export type Project = {
    id: number;
    created_at: string;
    name: string;
    description: string | null;
    end_date: string | null;
    team_id?: number | null;
    owner_id: string;
    google_drive_url?: string | null;
    is_favorited: boolean; 
    archived_at?: string | null;
    team_name?: string;
  };

  // Se elimina el tipo 'Subtask'
  export type Comment = {
    id: number;
    created_at: string;
    content: string;
    user_name: string | null;
    task_id: number;
  };
  
  export type Task = {
    id: number;
    title: string;
    description: string | null;
    due_date: string | null;
    completed: boolean;
    completed_at: string | null;
    assignee_user_id: string | null;
    status: string;
    projects: { id: number; name: string; } | null;
    assignee: { email: string; } | null;
    collaborators?: Collaborator[];
  };

  export interface TaskUpdatePayload {
    title?: string;
    description?: string | null;
    due_date?: string | null;
    project_id?: number | null;
    assignee_user_id?: string | null;
  }

  export interface CollaboratorRecord {
    user_id: string;}


export type UserPermissions = {
  role: string | null;
  mod_tareas: boolean;
  mod_calendario: boolean;
  mod_revenue: boolean;
  mod_finanzas: boolean;
  mod_producto: boolean;
};

export type ExperimentData = {
  hypothesis?: string;
  funnel_stage?: string;
  metric_base?: string;
  metric_target?: string;
  metric_result?: string;
  dashboard_link?: string;
  statistical_significance?: string;
  result?: 'won' | 'lost' | 'inconclusive' | 'pending';
  next_steps?: string;
  priority?: 'alta' | 'media' | 'baja';
};

export type ProductInitiative = {
  id: number;
  title: string;
  problem_statement: string | null;
  item_type: 'experiment' | 'feature' | 'tech_debt' | 'bug';
  phase: 'backlog' | 'discovery' | 'delivery' | 'finalized';
  status: 'pending' | 'design' | 'running' | 'analyzing' | 'paused' | 'completed';
  owner_id: string | null;
  rice_reach: number;
  rice_impact: number;
  rice_confidence: number;
  rice_effort: number;
  rice_score: number;
  experiment_data: ExperimentData;
  project_id: number | null;
  parent_id: number | null;
  period_type: 'week' | 'month' | null;
  period_value: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  owner_email?: string;
  project_name?: string;
};
