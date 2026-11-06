export interface EditableWorkExperience {
  title?: string;
  description?: string;
  companyName?: string;
  visibility?: boolean;
  startDate?: Date;
  endDate?: Date | null;
}

export interface EditableWorkExperienceDB {
  title?: string;
  description?: string;
  company_name?: string;
  visible?: boolean;
  start_date?: Date;
  end_date?: Date | null;
}