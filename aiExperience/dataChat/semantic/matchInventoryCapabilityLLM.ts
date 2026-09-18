import { createInventoryCapabilityMatcher } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { routeInventoryCapability } from '../../../services/geminiService';
export const matchInventoryCapabilityLLM = createInventoryCapabilityMatcher(routeInventoryCapability);
