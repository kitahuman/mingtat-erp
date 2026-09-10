export const DOCUMENT_TAIL_PAGINATION_CSS = `
    /* Keep the final item, all totals, and the document tail on one page. */
    .items { break-after: avoid-page; page-break-after: avoid; }
    .items tr.keep-with-tail {
      break-before: avoid-page;
      page-break-before: avoid;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .document-tail {
      break-before: avoid-page;
      page-break-before: avoid;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .document-tail > *,
    .document-tail .signature-table {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
`;
