import * as XLSX from 'xlsx';
import type { Task, FieldDefinition } from '@/types';

const STAGE_LABELS: Record<string, string> = {
  survey:       'Survey',
  proposal:     'Proposal',
  field_review: 'Field Review',
  documents:    'Documents',
  backend:      'Backend',
  completed:    'CONVERTED',
  dropped:      'Dropped',
};

function makeCloudinaryLinksClickable(ws: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddr];
      if (cell && typeof cell.v === 'string' &&
          (cell.v.includes('/raw/upload/') ||
           cell.v.startsWith('https://res.cloudinary.com'))) {
        cell.l = { Target: cell.v, Tooltip: 'Click to open' };
      }
    }
  }
}

export function exportTasksToExcel(tasks: Task[]): void {
  const dateStr = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  const sorted = [...tasks].sort((a, b) => {
    const numA = parseInt(a.taskNum.replace(/\D/g, ''), 10);
    const numB = parseInt(b.taskNum.replace(/\D/g, ''), 10);
    return numA - numB;
  });

  // ── Sheet 1: Tasks Summary ────────────────────────────────────────────────────

  // Application Journey steps, in their real, permanently-fixed
  // sequence — captured as {label, type} pairs (not just labels) so
  // photo-type steps can be given multiple photo-slot columns instead
  // of a single date column. Established from ONE real reference
  // task's own stored step array (Loan preferred: 18 steps, the
  // superset containing Cash's 16 in their correct positions), NOT by
  // whichever task happens to sort first. Confirmed 22 Aug 2026: a
  // task's own applicationJourneySteps array is sorted correctly once,
  // at creation, and never reordered afterward.
  const loanRef = sorted.find(
    (t) => t.paymentType === 'loan' && (t.applicationJourneySteps?.length ?? 0) > 0,
  );
  const cashRef = sorted.find(
    (t) => t.paymentType === 'cash' && (t.applicationJourneySteps?.length ?? 0) > 0,
  );
  const referenceStepDefs = (loanRef ?? cashRef)?.applicationJourneySteps.map(
    (s) => ({ label: s.label, type: s.type }),
  ) ?? [];

  // Defensive fallback: append any {label, type} seen on ANY task not
  // already covered above — appended at the end, first-encountered
  // order, so nothing is ever silently dropped.
  const journeySteps: { label: string; type: string }[] = [...referenceStepDefs];
  const seenJourneyLabels = new Set(referenceStepDefs.map((s) => s.label));
  for (const t of sorted) {
    for (const step of (t.applicationJourneySteps ?? [])) {
      if (!seenJourneyLabels.has(step.label)) {
        seenJourneyLabels.add(step.label);
        journeySteps.push({ label: step.label, type: step.type });
      }
    }
  }

  // For photo-type steps specifically, find the max photo count across
  // all tasks so every task gets the same number of "Label - Photo N"
  // columns — mirrors exactly the same maxPhotoCounts pattern already
  // proven for Sheet 2 below.
  const journeyMaxPhotoCounts: Record<string, number> = {};
  for (const t of sorted) {
    for (const stepDef of journeySteps) {
      if (stepDef.type !== 'photo') continue;
      const step = (t.applicationJourneySteps ?? []).find((s) => s.label === stepDef.label);
      const count = step?.photoUrls?.length ?? 0;
      if (count > (journeyMaxPhotoCounts[stepDef.label] ?? 0)) {
        journeyMaxPhotoCounts[stepDef.label] = count;
      }
    }
  }

  const summaryRows = sorted.map((t) => {
    // Assumption: a single task never has two steps sharing the identical
    // label — .find() below takes the first match only if it ever did.
    const journeyStepCols: Record<string, string> = {};
    for (const stepDef of journeySteps) {
      const step = (t.applicationJourneySteps ?? []).find((s) => s.label === stepDef.label);
      // Every step, photo or not, gets its own completion-date column first —
      // photo-type steps ADD photo-slot columns after it, they never replace it.
      journeyStepCols[stepDef.label] = (step && step.status === 'done' && step.realDate)
        ? dateStr(new Date(step.realDate))
        : '';
      if (stepDef.type === 'photo') {
        const maxPhotos = Math.max(journeyMaxPhotoCounts[stepDef.label] ?? 0, 1);
        for (let i = 0; i < maxPhotos; i++) {
          journeyStepCols[`${stepDef.label} - Photo ${i + 1}`] = step?.photoUrls?.[i] ?? '';
        }
      }
    }

    return {
    'Task #':              t.taskNum,
    'Title':               t.title,
    'Description':         t.description    ?? '',
    'Consumer Mobile':     t.consumerMobile ?? '',
    'State':                   t.state                 ?? '',
    'District':                t.district              ?? '',
    'Lead Source':             t.leadSource             ?? '',
    'Lead Source Employee':    t.leadSourceEmployeeName  ?? '',
    'Lead Generated By':       t.leadGeneratedByName     ?? '',
    'Lead Generated By Note':  t.leadGeneratedByNote     ?? '',
    'Status':              t.status,
    'Assigned To':         t.assignedToName ?? '',
    'Engineer Code':       t.assignedToCode ?? '',
    'Engineer Mobile':     t.assignedToMobile ?? '',
    'Due Date':            dateStr(t.dueDate),
    'Created Date':        dateStr(t.createdAt),
    'Submitted Date':      dateStr(t.submittedAt),
    'Follow-up Date':      dateStr(t.followUpDate),
    'Blocked Reason':      t.blockedReason ?? '',
    'GPS Latitude':        t.location?.lat ?? '',
    'GPS Longitude':       t.location?.lng ?? '',
    'Pipeline Stage':      STAGE_LABELS[t.pipelineStage ?? 'survey'] ?? (t.pipelineStage ?? 'survey'),
    'Needs Correction':        t.correctionReturnTo ? 'Yes' : 'No',
    'Correction Return Stage': t.correctionReturnTo ? (STAGE_LABELS[t.correctionReturnTo] ?? t.correctionReturnTo) : '',
    'Correction Note':         t.correctionNote ?? '',
    'Correction Set Date':     dateStr(t.correctionSetAt),
    'Payment Type':        t.paymentType
                             ? (t.paymentType === 'cash' ? 'Cash' : 'Loan')
                             : '',
    'Sales Closed':        t.saleClosed ? 'Yes' : 'No',
    'Sales Closed Source': t.saleClosed
                             ? (t.saleClosedSource === 'manual' ? 'Manual' : 'Auto')
                             : '',
    'Journey Steps Done':  t.applicationJourneySteps
                             ? t.applicationJourneySteps.filter((s) => s.status === 'done').length
                             : '',
    'Journey Total Steps': t.applicationJourneySteps?.length ?? '',
    'Dropped Reason':      t.droppedReason ?? '',
    'Backend Remark':       t.backendRemark ?? '',
    'Backend Remark By':    t.backendRemarkUpdatedBy ?? '',
    'Backend Remark Date':  dateStr(t.backendRemarkUpdatedAt),
    ...journeyStepCols,
    'Conversion Date':     (() => {
                              const entry = (t.stageHistory ?? [])
                                .find((e) => e.toStage === 'completed');
                              return entry?.timestamp ? dateStr(entry.timestamp) : '';
                            })(),
    'Proposal Remark':      t.proposalRemark ?? '',
    'Proposal Remark By':   t.proposalRemarkUpdatedBy ?? '',
    'Proposal Remark Date': dateStr(t.proposalRemarkUpdatedAt),
    };
  });

  // ── Sheet 2: Field Answers ────────────────────────────────────────────────────
  // One row per task. Photo fields get one column per photo slot so every URL
  // is its own clickable cell. Non-photo fields get one column for the text
  // answer (plus extra photo columns if the field also has photos attached).

  // Collect all unique fields across all tasks (union), sorted by sortOrder.
  const fieldMap = new Map<string, FieldDefinition>();
  for (const t of sorted) {
    for (const f of (t.fields ?? [])) {
      if (!fieldMap.has(f.fieldId)) fieldMap.set(f.fieldId, f);
    }
  }
  const templateFields = [...fieldMap.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Pass 1 — find the maximum photo count per field across all tasks.
  const maxPhotoCounts: Record<string, number> = {};
  for (const t of sorted) {
    for (const field of templateFields) {
      const count = (t.fieldPhotos?.[field.fieldId] ?? []).length;
      if (count > (maxPhotoCounts[field.fieldId] ?? 0)) {
        maxPhotoCounts[field.fieldId] = count;
      }
    }
  }

  // Pass 2 — build the ordered column list.
  // Each entry is { header: string; getValue: (t: Task) => string }.
  const FIXED_COLS = [
    { header: 'Task #',         getValue: (t: Task) => t.taskNum },
    { header: 'Title',          getValue: (t: Task) => t.title },
    { header: 'Assigned To',    getValue: (t: Task) => t.assignedToName ?? '' },
    { header: 'Status',         getValue: (t: Task) => t.status },
    { header: 'Submitted Date', getValue: (t: Task) => dateStr(t.submittedAt) },
  ];

  type Col = { header: string; getValue: (t: Task) => string; isPhoto: boolean };
  const dynamicCols: Col[] = [];

  for (const field of templateFields) {
    if (field.type === 'section_header') continue;

    const maxPhotos = maxPhotoCounts[field.fieldId] ?? 0;

    if (field.type === 'photo_only') {
      // Only photo columns (at least 1 so the column always appears).
      const slots = Math.max(maxPhotos, 1);
      for (let i = 0; i < slots; i++) {
        const idx = i;
        dynamicCols.push({
          header:   `${field.label} - Photo ${idx + 1}`,
          isPhoto:  true,
          getValue: (t: Task) => (t.fieldPhotos?.[field.fieldId] ?? [])[idx] ?? '',
        });
      }
    } else {
      // Text answer column.
      dynamicCols.push({
        header:   field.label,
        isPhoto:  false,
        getValue: (t: Task) => {
          const val = t.fieldAnswers?.[field.fieldId]?.value ?? '';
          if (!val) return '';
          if (field.type === 'measurement' && field.unit) return `${val} ${field.unit}`;
          return val;
        },
      });
      // Extra photo columns if any task attached photos to this non-photo field.
      for (let i = 0; i < maxPhotos; i++) {
        const idx = i;
        dynamicCols.push({
          header:   `${field.label} - Photo ${idx + 1}`,
          isPhoto:  true,
          getValue: (t: Task) => (t.fieldPhotos?.[field.fieldId] ?? [])[idx] ?? '',
        });
      }
    }
  }

  // Pass 3 — build one row object per task.
  const answerRows: Record<string, string>[] = sorted.map((t) => {
    const row: Record<string, string> = {};
    for (const col of FIXED_COLS)   row[col.header] = col.getValue(t);
    for (const col of dynamicCols)  row[col.header] = col.getValue(t);
    return row;
  });

  // Column widths.
  const fixedWidths = [8, 35, 20, 12, 14];
  const dynamicWidths = dynamicCols.map((c) => ({ wch: c.isPhoto ? 50 : 20 }));

  // ── Workbook ──────────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  ws1['!cols'] = [
    { wch: 8 }, { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 22 },
    { wch: 12 }, { wch: 20 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 14 },
    { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 12 },
    { wch: 30 }, { wch: 18 }, { wch: 14 },
    ...journeySteps.flatMap((stepDef) =>
      stepDef.type === 'photo'
        ? [{ wch: 14 }, ...Array(Math.max(journeyMaxPhotoCounts[stepDef.label] ?? 0, 1)).fill({ wch: 50 })]
        : [{ wch: 14 }]
    ),
    { wch: 14 },
    { wch: 30 }, { wch: 18 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Tasks Summary');

  const allHeaders = [
    ...FIXED_COLS.map((c) => c.header),
    ...dynamicCols.map((c) => c.header),
  ];
  const ws2 = XLSX.utils.json_to_sheet(
    answerRows.length > 0 ? answerRows : [{}],
    { header: allHeaders },
  );

  ws2['!cols'] = [
    ...fixedWidths.map((w) => ({ wch: w })),
    ...dynamicWidths,
  ];

  // Make Cloudinary URLs clickable hyperlinks in Excel — both sheets
  makeCloudinaryLinksClickable(ws1);
  makeCloudinaryLinksClickable(ws2);

  XLSX.utils.book_append_sheet(wb, ws2, 'Field Answers');

  const filename = `solarops_tasks_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
