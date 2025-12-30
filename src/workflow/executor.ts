/**
 * Workflow Executor
 * 
 * Executes workflow definitions by resolving dependencies and 
 * calling tools in the correct order.
 */
import { Workflow, WorkflowStep, StepResult, WorkflowExecutionResult } from './schema.js';
import { getToolHandler } from '../server/tool-registry.js';
import { SessionContext } from '../server/types.js';

/**
 * Interpolate variables in a string using {{varName}} syntax
 */
function interpolate(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) {
      return typeof variables[key] === 'string' 
        ? variables[key] 
        : JSON.stringify(variables[key]);
    }
    return match; // Leave unmatched templates as-is
  });
}

/**
 * Deep interpolate an object's string values
 */
function interpolateObject(obj: any, variables: Record<string, any>): any {
  if (typeof obj === 'string') {
    return interpolate(obj, variables);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, variables));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, variables);
    }
    return result;
  }
  return obj;
}

/**
 * Topological sort for dependency resolution
 */
function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const stepMap = new Map<string, WorkflowStep>();
  const visited = new Set<string>();
  const result: WorkflowStep[] = [];
  
  for (const step of steps) {
    stepMap.set(step.name, step);
  }
  
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    
    const step = stepMap.get(name);
    if (!step) return;
    
    for (const dep of step.dependsOn || []) {
      visit(dep);
    }
    
    result.push(step);
  }
  
  for (const step of steps) {
    visit(step.name);
  }
  
  return result;
}

export class WorkflowExecutor {
  private ctx: SessionContext;
  private variables: Record<string, any> = {};
  
  constructor(ctx: SessionContext) {
    this.ctx = ctx;
  }
  
  /**
   * Execute a workflow definition
   */
  async execute(
    workflow: Workflow, 
    params: Record<string, any> = {}
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const errors: string[] = [];
    
    // Initialize variables with parameters
    this.variables = { ...params };
    
    // Apply parameter defaults
    if (workflow.parameters) {
      for (const [key, def] of Object.entries(workflow.parameters)) {
        if (!(key in this.variables) && def.default !== undefined) {
          this.variables[key] = def.default;
        }
        if (def.required && !(key in this.variables)) {
          errors.push(`Missing required parameter: ${key}`);
        }
      }
    }
    
    if (errors.length > 0) {
      return {
        workflowName: workflow.name,
        success: false,
        stepResults: [],
        totalDuration: Date.now() - startTime,
        errors
      };
    }
    
    // Sort steps by dependencies
    const sortedSteps = topologicalSort(workflow.steps);
    
    // Execute steps in order
    for (const step of sortedSteps) {
      const stepResult = await this.executeStep(step);
      stepResults.push(stepResult);
      
      if (!stepResult.success) {
        errors.push(`Step '${step.name}' failed: ${stepResult.error}`);
        // Stop on first error
        break;
      }
      
      // Store result if requested
      if (step.storeAs && stepResult.result) {
        this.variables[step.storeAs] = stepResult.result;
      }
    }
    
    // Build output
    let output: any = undefined;
    if (workflow.output) {
      output = {};
      for (const stepName of workflow.output.include) {
        const result = stepResults.find(r => r.stepName === stepName);
        if (result) {
          output[stepName] = result.result;
        }
      }
      if (workflow.output.summary) {
        output.summary = interpolate(workflow.output.summary, this.variables);
      }
    }
    
    return {
      workflowName: workflow.name,
      success: errors.length === 0,
      stepResults,
      totalDuration: Date.now() - startTime,
      output,
      errors
    };
  }
  
  private async executeStep(step: WorkflowStep): Promise<StepResult> {
    const startTime = Date.now();
    
    // Check condition if present
    if (step.condition) {
      try {
        const conditionFn = new Function('vars', `with(vars) { return ${step.condition}; }`);
        if (!conditionFn(this.variables)) {
          return {
            stepName: step.name,
            success: true,
            result: { skipped: true, reason: 'Condition not met' },
            duration: Date.now() - startTime
          };
        }
      } catch (err: any) {
        return {
          stepName: step.name,
          success: false,
          error: `Condition evaluation failed: ${err.message}`,
          duration: Date.now() - startTime
        };
      }
    }
    
    // Get tool handler
    const handler = getToolHandler(step.tool);
    if (!handler) {
      return {
        stepName: step.name,
        success: false,
        error: `Tool not found: ${step.tool}`,
        duration: Date.now() - startTime
      };
    }
    
    try {
      // Interpolate parameters
      const interpolatedParams = interpolateObject(step.params, this.variables);
      
      // Execute tool
      const result = await handler(interpolatedParams, this.ctx);
      
      // Parse result if it's in MCP format
      let parsedResult = result;
      if (result?.content?.[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
        } catch {
          parsedResult = result.content[0].text;
        }
      }
      
      return {
        stepName: step.name,
        success: true,
        result: parsedResult,
        duration: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        stepName: step.name,
        success: false,
        error: err.message,
        duration: Date.now() - startTime
      };
    }
  }
}
