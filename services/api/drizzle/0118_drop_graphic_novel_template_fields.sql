-- Free-layout comics no longer use preset template metadata.
-- Keep legacy columns in place for launch safety; application code no longer reads them.

UPDATE graphic_novel_projects
SET layout_manifest = layout_manifest - 'layoutTemplateImageSent' - 'templateFamily'
WHERE layout_manifest ?| ARRAY['layoutTemplateImageSent', 'templateFamily'];

UPDATE graphic_novel_pages
SET generation_params =
  generation_params
    - 'layoutTemplateImageSent'
    - 'templateReferenceUsed'
    - 'templateFreeLayout'
    - 'graphicNovelFreeLayout'
WHERE generation_params ?| ARRAY[
  'layoutTemplateImageSent',
  'templateReferenceUsed',
  'templateFreeLayout',
  'graphicNovelFreeLayout'
];

UPDATE image_validation_results
SET result = result - 'hasTemplateColorResidue' - 'templateColorResidueDetails'
WHERE result ?| ARRAY['hasTemplateColorResidue', 'templateColorResidueDetails'];
