import mongoose, { Schema, Model, models } from 'mongoose';

export type ProjectStatus = 'Planned' | 'Active' | 'Done';

export interface ProjectDoc extends mongoose.Document {
  projectId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<ProjectDoc>(
  {
    projectId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['Planned', 'Active', 'Done'], default: 'Planned' },
  },
  { timestamps: true }
);

export const ProjectModel: Model<ProjectDoc> =
  (models.Project as Model<ProjectDoc>) || mongoose.model<ProjectDoc>('Project', ProjectSchema);
