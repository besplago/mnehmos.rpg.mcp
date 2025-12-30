/**
 * Workflow Schema Definitions
 * 
 * Defines the structure of workflow YAML files for automation.
 */
import { z } from 'zod';

// Step action - which tool to call
export const WorkflowStepSchema = z.object({
  name: z.string().describe('Step name (for reference in dependencies)'),
  tool: z.string().describe('Tool name to execute'),
  params: z.record(z.any()).describe('Parameters to pass to the tool'),
  dependsOn: z.array(z.string()).optional().describe('Step names this step depends on'),
  condition: z.string().optional().describe('JavaScript expression to evaluate (must return true to execute)'),
  storeAs: z.string().optional().describe('Save result to this variable name for interpolation')
});

// Complete workflow definition
export const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  
  // Input parameters the workflow accepts
  parameters: z.record(z.object({
    type: z.enum(['string', 'number', 'boolean', 'array']),
    description: z.string(),
    default: z.any().optional(),
    required: z.boolean().default(true)
  })).optional(),
  
  // Steps to execute
  steps: z.array(WorkflowStepSchema).min(1),
  
  // Output - what to return
  output: z.object({
    include: z.array(z.string()).describe('Step names whose results to include'),
    summary: z.string().optional().describe('Template string for summary')
  }).optional()
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;

// Execution result for a single step
export interface StepResult {
  stepName: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number; // ms
}

// Complete workflow execution result
export interface WorkflowExecutionResult {
  workflowName: string;
  success: boolean;
  stepResults: StepResult[];
  totalDuration: number;
  output?: any;
  errors: string[];
}
