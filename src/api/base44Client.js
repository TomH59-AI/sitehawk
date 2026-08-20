import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { bypassAdaptiveQc, superviseFunctionCall } from '@/lib/adaptiveTaskQc';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const rawBase44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

const rawInvoke = rawBase44.functions.invoke.bind(rawBase44.functions);
const supervisedFunctions = new Proxy(rawBase44.functions, {
  get(target, property, receiver) {
    if (property !== 'invoke') return Reflect.get(target, property, receiver);
    return async (taskKey, input) => {
      if (bypassAdaptiveQc(taskKey)) return rawInvoke(taskKey, input);
      return superviseFunctionCall(
        taskKey,
        input,
        () => rawInvoke(taskKey, input),
        (qcInput) => rawInvoke('adaptiveSiteHawkQc', qcInput)
      );
    };
  }
});

// All standard SDK behavior is preserved; backend function calls pass through
// the adaptive SiteHawk QC gate unless they are explicitly allowlisted controls.
export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'functions') return supervisedFunctions;
    return Reflect.get(target, property, receiver);
  }
});
