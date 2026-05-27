import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  streamFleetGraphChatModelResponse,
  traceFleetGraphChatCompletion,
  type FleetGraphChatCompletion,
  type FleetGraphChatModel,
  type FleetGraphChatModelMessage,
  type FleetGraphChatTraceContext,
} from './chat.js';
import type {
  AtRiskWeekGraphDependencies,
  AtRiskWeekGraphInput,
  AtRiskWeekGraphState,
} from './detectors/at-risk-week.js';

export const fleetGraphGraphName = 'fleetgraph.runtime';

export type FleetGraphGraphBranch = 'proactive_at_risk_week' | 'ondemand_chat';
export type FleetGraphGraphStatus = 'running' | 'completed';
export type FleetGraphGraphNodeName = 'branch' | FleetGraphGraphBranch;

export type FleetGraphProactiveAtRiskWeekInput = {
  mode: 'proactive_at_risk_week';
  atRiskWeek: {
    input: AtRiskWeekGraphInput;
  };
};

export type FleetGraphOnDemandChatInput = {
  mode: 'ondemand_chat';
  chat: {
    model: FleetGraphChatModel;
    messages: FleetGraphChatModelMessage[];
    abortSignal: AbortSignal;
    traceContext: FleetGraphChatTraceContext;
    onToken: (token: string) => void | Promise<void>;
  };
};

export type FleetGraphGraphInput = FleetGraphProactiveAtRiskWeekInput | FleetGraphOnDemandChatInput;

export type FleetGraphGraphDependencies = {
  proactiveAtRiskWeek?: {
    runGraph: (
      input: AtRiskWeekGraphInput,
      dependencies: AtRiskWeekGraphDependencies
    ) => Promise<AtRiskWeekGraphState>;
    dependencies: AtRiskWeekGraphDependencies;
  };
};

export type FleetGraphGraphState = {
  graphName: typeof fleetGraphGraphName;
  input: FleetGraphGraphInput;
  status: FleetGraphGraphStatus;
  activeNode: FleetGraphGraphNodeName | null;
  completedNodes: FleetGraphGraphNodeName[];
  branch: FleetGraphGraphBranch | null;
  proactiveAtRiskWeek: AtRiskWeekGraphState | null;
  chat: {
    completion: FleetGraphChatCompletion;
  } | null;
};

const fleetGraphGraphAnnotation = Annotation.Root({
  graphState: Annotation<FleetGraphGraphState>(),
});

type FleetGraphLangGraphState = typeof fleetGraphGraphAnnotation.State;

export type FleetGraphCompiledGraph = {
  invoke: (
    input: FleetGraphLangGraphState
  ) => Promise<FleetGraphLangGraphState>;
};

export class FleetGraphGraphDependencyError extends Error {
  constructor(branch: FleetGraphGraphBranch, dependencyName: string) {
    super(`FleetGraph graph dependency missing: branch=${branch}, dependency=${dependencyName}`);
    this.name = 'FleetGraphGraphDependencyError';
  }
}

export class FleetGraphGraphModeError extends Error {
  constructor(expected: FleetGraphGraphBranch, actual: FleetGraphGraphBranch) {
    super(`FleetGraph graph mode mismatch: expected=${expected}, actual=${actual}`);
    this.name = 'FleetGraphGraphModeError';
  }
}

export function createFleetGraphInitialState(input: FleetGraphGraphInput): FleetGraphGraphState {
  return {
    graphName: fleetGraphGraphName,
    input,
    status: 'running',
    activeNode: 'branch',
    completedNodes: [],
    branch: null,
    proactiveAtRiskWeek: null,
    chat: null,
  };
}

export function compileFleetGraphGraph(
  dependencies: FleetGraphGraphDependencies
): FleetGraphCompiledGraph {
  const graph = new StateGraph(fleetGraphGraphAnnotation)
    .addNode('branch', branchNode)
    .addNode('proactive_at_risk_week', (state: FleetGraphLangGraphState) => (
      proactiveAtRiskWeekNode(state, dependencies)
    ))
    .addNode('ondemand_chat', ondemandChatNode)
    .addEdge(START, 'branch')
    .addConditionalEdges('branch', routeFleetGraphGraph, [
      'proactive_at_risk_week',
      'ondemand_chat',
    ])
    .addEdge('proactive_at_risk_week', END)
    .addEdge('ondemand_chat', END);

  return graph.compile({
    name: fleetGraphGraphName,
  });
}

export async function runFleetGraphGraph(
  input: FleetGraphGraphInput,
  dependencies: FleetGraphGraphDependencies
): Promise<FleetGraphGraphState> {
  const graph = compileFleetGraphGraph(dependencies);
  const output = await graph.invoke({
    graphState: createFleetGraphInitialState(input),
  });

  return output.graphState;
}

async function branchNode(state: FleetGraphLangGraphState): Promise<Partial<FleetGraphLangGraphState>> {
  const branch = state.graphState.input.mode;

  return {
    graphState: {
      ...state.graphState,
      branch,
      activeNode: branch,
      completedNodes: appendCompletedNode(state.graphState.completedNodes, 'branch'),
    },
  };
}

async function proactiveAtRiskWeekNode(
  state: FleetGraphLangGraphState,
  dependencies: FleetGraphGraphDependencies
): Promise<Partial<FleetGraphLangGraphState>> {
  const graphInput = state.graphState.input;
  assertProactiveAtRiskWeekInput(graphInput);
  const proactiveDependencies = dependencies.proactiveAtRiskWeek;

  if (proactiveDependencies === undefined) {
    throw new FleetGraphGraphDependencyError('proactive_at_risk_week', 'proactiveAtRiskWeek');
  }

  const atRiskWeekState = await proactiveDependencies.runGraph(
    graphInput.atRiskWeek.input,
    proactiveDependencies.dependencies
  );

  return {
    graphState: {
      ...state.graphState,
      status: 'completed',
      activeNode: null,
      completedNodes: appendCompletedNode(
        state.graphState.completedNodes,
        'proactive_at_risk_week'
      ),
      proactiveAtRiskWeek: atRiskWeekState,
    },
  };
}

async function ondemandChatNode(
  state: FleetGraphLangGraphState
): Promise<Partial<FleetGraphLangGraphState>> {
  const graphInput = state.graphState.input;
  assertOnDemandChatInput(graphInput);
  const chatInput = graphInput.chat;
  const completion = await traceFleetGraphChatCompletion({
    traceContext: chatInput.traceContext,
    operation: () => streamFleetGraphChatModelResponse({
      model: chatInput.model,
      messages: chatInput.messages,
      abortSignal: chatInput.abortSignal,
      streamConfig: chatInput.traceContext.streamConfig,
      onToken: chatInput.onToken,
    }),
  });

  return {
    graphState: {
      ...state.graphState,
      status: 'completed',
      activeNode: null,
      completedNodes: appendCompletedNode(state.graphState.completedNodes, 'ondemand_chat'),
      chat: {
        completion,
      },
    },
  };
}

function routeFleetGraphGraph(state: FleetGraphLangGraphState): FleetGraphGraphBranch {
  return state.graphState.input.mode;
}

function assertProactiveAtRiskWeekInput(
  input: FleetGraphGraphInput
): asserts input is FleetGraphProactiveAtRiskWeekInput {
  if (input.mode !== 'proactive_at_risk_week') {
    throw new FleetGraphGraphModeError('proactive_at_risk_week', input.mode);
  }
}

function assertOnDemandChatInput(
  input: FleetGraphGraphInput
): asserts input is FleetGraphOnDemandChatInput {
  if (input.mode !== 'ondemand_chat') {
    throw new FleetGraphGraphModeError('ondemand_chat', input.mode);
  }
}

function appendCompletedNode(
  completedNodes: FleetGraphGraphNodeName[],
  nodeName: FleetGraphGraphNodeName
): FleetGraphGraphNodeName[] {
  return [...completedNodes, nodeName];
}
