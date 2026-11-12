import { scenePath as appScenePath } from '../../src/app/routes';
import type { Language } from '../../src/locale';
import { clips } from '../content-fixtures';

export const scenePath = (slug: string, draftId?: string, language: Language = 'zh-CN') => appScenePath(slug, draftId, language, clips);
