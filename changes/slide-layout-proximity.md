---
type: changed
packages: [gallery]
---

Keep closing headings and contact details together in a centered, content-sized group. Preserve complete contact images with the layout's `contain` fit default. Add the `agenda-split` layout for concise agendas beside the title; retain the full-width `agenda` layout for detailed entries.

Allow timeline content in both `two-column` regions so that the layout supports its documented promise of two independent columns of any content.

Preserve whole pictures by default in the generic two-column layout and add `three-column` for three independent equal columns of any supported content kind. Explicit image-block fit and higher-level design overrides continue to take precedence. The gallery's intentionally cropped image-grid layout is unchanged.

Release note: changing the existing closing drawing requires a major gallery release under the pixel-stability policy. The new agenda record alone requires a minor release. No package version is changed during this design audit; assemble this fragment through the gallery's release-preparation process before publishing.
