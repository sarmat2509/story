import assert from 'node:assert/strict';
import {
  buildElevenLabsV3SpeechTagCatalog,
  buildGrokSpeechTagCatalog,
  buildOpenAiTtsSpeechTagCatalog,
} from '../../providers/audio/ttsSpeechTagCatalogs';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest } from '../../providers/base/JsonSchema';
import {
  clearAiServiceTestOverrides,
  installAiServiceTestOverrides,
} from '../aiService';
import { enrichDeferredProsodyForTtsChunk } from '../ttsProsodyTaggingService';

function schemaMentions(schema: unknown, key: string): boolean {
  return JSON.stringify(schema ?? {}).includes(`"${key}"`);
}

function createProsodyTextProvider(handlers: {
  onFull?: (request: GenerateStructuredRequest<unknown>) => unknown;
  onIndex?: (request: GenerateStructuredRequest<unknown>) => unknown;
}): ITextProvider & { calls: { full: number; index: number } } {
  const calls = { full: 0, index: 0 };
  return {
    calls,
    async generateStructured(request) {
      if (schemaMentions(request.schema, 'tagInsertions')) {
        calls.index += 1;
        assert.ok(handlers.onIndex, 'unexpected index-json prosody call');
        return handlers.onIndex(request) as never;
      }
      calls.full += 1;
      assert.ok(handlers.onFull, 'unexpected full-text prosody call');
      return handlers.onFull(request) as never;
    },
    async generateText(_request: GenerateTextRequest) {
      throw new Error('Unexpected generateText during deferred prosody');
    },
  };
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';

  const canon = 'Mira found a lantern beside the quiet path.';

  // --- Catalog without markup: no LLM ---
  {
    const catalog = buildOpenAiTtsSpeechTagCatalog();
    const provider = createProsodyTextProvider({});
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const result = await enrichDeferredProsodyForTtsChunk({
        canonText: canon,
        catalog,
        language: 'en',
        storyId: 'prosody-skip-1',
      });
      assert.equal(result.usedLlm, false);
      assert.equal(result.taggedText, canon);
      assert.equal(provider.calls.full, 0);
      assert.equal(provider.calls.index, 0);
    } finally {
      clearAiServiceTestOverrides();
    }
  }

  // --- Wrapping catalog: full-text only LLM ---
  {
    const catalog = buildGrokSpeechTagCatalog();
    assert.ok(catalog.wrappingTagNames.length > 0);
    const provider = createProsodyTextProvider({
      onFull: () => ({ taggedText: `<soft>${canon}</soft>` }),
    });
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const result = await enrichDeferredProsodyForTtsChunk({
        canonText: canon,
        catalog,
        language: 'en',
        storyId: 'prosody-full-1',
        captureBranchDiagnostics: true,
      });
      assert.equal(result.usedLlm, true);
      assert.equal(provider.calls.full, 1);
      assert.equal(provider.calls.index, 0);
      assert.equal(result.branchDiagnostics?.winner, 'full_text');
      assert.ok(result.taggedText.includes('<soft>'));
      assert.ok(result.taggedText.includes('Mira found a lantern'));
    } finally {
      clearAiServiceTestOverrides();
    }
  }

  // --- Bracket catalog: parallel index preferred over full ---
  {
    const catalog = buildElevenLabsV3SpeechTagCatalog();
    const provider = createProsodyTextProvider({
      onFull: () => ({ taggedText: `[pause] ${canon}` }),
      onIndex: () => ({
        tagInsertions: [{ utf16OffsetBefore: 0, tagInner: 'pause' }],
      }),
    });
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const result = await enrichDeferredProsodyForTtsChunk({
        canonText: canon,
        catalog,
        language: 'en',
        storyId: 'prosody-index-1',
        captureBranchDiagnostics: true,
      });
      assert.equal(result.usedLlm, true);
      assert.equal(provider.calls.full, 1);
      assert.equal(provider.calls.index, 1);
      assert.equal(result.branchDiagnostics?.winner, 'index_json');
      assert.equal(result.branchDiagnostics?.deferredProsodyParallelIndex, true);
      assert.ok(result.taggedText.startsWith('[pause]'));
    } finally {
      clearAiServiceTestOverrides();
    }
  }

  // --- Parallel: index invalid → full_text wins ---
  {
    const catalog = buildElevenLabsV3SpeechTagCatalog();
    const provider = createProsodyTextProvider({
      onFull: () => ({ taggedText: `[pause] ${canon}` }),
      onIndex: () => ({
        tagInsertions: [{ utf16OffsetBefore: 99999, tagInner: 'pause' }],
      }),
    });
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const result = await enrichDeferredProsodyForTtsChunk({
        canonText: canon,
        catalog,
        language: 'en',
        storyId: 'prosody-full-fallback-1',
        captureBranchDiagnostics: true,
      });
      assert.equal(result.usedLlm, true);
      assert.equal(result.branchDiagnostics?.winner, 'full_text');
      assert.ok(result.taggedText.startsWith('[pause]'));
    } finally {
      clearAiServiceTestOverrides();
    }
  }

  // --- Both empty → canon fallback ---
  {
    const catalog = buildElevenLabsV3SpeechTagCatalog();
    const provider = createProsodyTextProvider({
      onFull: () => ({ taggedText: '' }),
      onIndex: () => ({ tagInsertions: [] }),
    });
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const result = await enrichDeferredProsodyForTtsChunk({
        canonText: canon,
        catalog,
        language: 'en',
        storyId: 'prosody-none-1',
        captureBranchDiagnostics: true,
      });
      assert.equal(result.taggedText, canon);
      assert.equal(result.usedLlm, false);
      assert.equal(result.branchDiagnostics?.winner, 'none');
    } finally {
      clearAiServiceTestOverrides();
    }
  }

  console.log('deferred prosody LLM contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
