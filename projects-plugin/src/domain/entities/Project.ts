export type ProjectStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface ProjectImage {
  image_id: string;
  filename: string;
  content_type: string;
  cloudfront_url: string;
  uploaded_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  rich_text: string;
  category: string;
  status: ProjectStatus;
  is_enabled: boolean;
  max_participants: number;
  current_participants: number;
  start_date: string;
  end_date: string;
  created_by: string;
  notification_emails: string[];
  images: ProjectImage[];
  form_schema: import('./FormSchema').FormSchema | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  name: string;
  description: string;
  rich_text?: string;
  category: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  notification_emails?: string[];
  image_url?: string;
  cloudfront_url?: string;
}

export interface ProjectUpdateData extends Partial<CreateProjectData> {
  status?: ProjectStatus;
  is_enabled?: boolean;
}
