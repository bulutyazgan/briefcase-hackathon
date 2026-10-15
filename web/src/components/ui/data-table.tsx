import { useMemo, useState, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { content } from './content.stylex'
import { styles } from './data-table.stylex'
import { Text } from './text'

export type DataTableColumn<T> = {
  key: string
  label: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
  searchValue?: (row: T) => string
  align?: 'start' | 'end'
  mono?: boolean
  width?: string
}

type RowProps = ReturnType<typeof stylex.props>

// The row's own styles (hover, transition) and a caller's entrance animation touch different properties, so the class lists simply concatenate.
function mergeRowProps(base: RowProps, extra: RowProps | undefined): RowProps {
  if (!extra) return base
  const className = [base.className, extra.className].filter(Boolean).join(' ')
  return { className: className || undefined, style: base.style || extra.style ? { ...base.style, ...extra.style } : undefined }
}

export function DataTable<T>({
  rows, columns, rowKey, loading = false, searchPlaceholder = 'Search records',
  toolbar, emptyTitle, emptyBody, pageSize = 10, onRowClick, rowProps,
}: {
  rows: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  searchPlaceholder?: string
  toolbar?: ReactNode
  emptyTitle: string
  emptyBody?: string
  pageSize?: number
  onRowClick?: (row: T) => void
  // Extra props per row from stylex.props, e.g. an entrance for rows seen for the first time.
  rowProps?: (row: T) => RowProps
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(1)
  const searchable = columns.filter((column) => column.searchValue)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = rows.filter((row) => !needle || searchable.some((column) => (column.searchValue?.(row) ?? '').toLowerCase().includes(needle)))
    const column = columns.find((item) => item.key === sort?.key)
    if (column?.sortValue && sort) matches.sort((left, right) => {
      const a = column.sortValue?.(left) ?? ''
      const b = column.sortValue?.(right) ?? ''
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      return sort.direction === 'asc' ? result : -result
    })
    return matches
  }, [rows, columns, searchable, query, sort])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  function cycleSort(key: string): void {
    setSort((current) => current?.key !== key ? { key, direction: 'asc' } : current.direction === 'asc' ? { key, direction: 'desc' } : null)
    setPage(1)
  }
  return <div {...stylex.props(styles.root)}>
    {searchable.length ? <div {...stylex.props(styles.toolbar)}>
      <input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} {...stylex.props(content.input, styles.search)} />
      {toolbar}
    </div> : toolbar ? <div {...stylex.props(styles.toolbar)}>{toolbar}</div> : null}
    {filtered.length === 0 && !loading ? <div {...stylex.props(styles.empty)}>
      <Text role="heading16">{query ? `No matches for “${query}”` : emptyTitle}</Text>
      {query ? <button type="button" onClick={() => { setQuery(''); setPage(1) }} {...stylex.props(styles.clear)}>Clear search</button> : emptyBody ? <Text role="compact">{emptyBody}</Text> : null}
    </div> : <div {...stylex.props(styles.wrap)}><table {...stylex.props(styles.table)}>
      <colgroup>{columns.map((column) => <col key={column.key} width={column.width} />)}</colgroup>
      <thead><tr>{columns.map((column) => <th key={column.key} scope="col" aria-sort={sort?.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : column.sortValue ? 'none' : undefined} {...stylex.props(styles.heading, column.align === 'end' && styles.alignEnd)}>
        {column.sortValue ? <button type="button" onClick={() => cycleSort(column.key)} {...stylex.props(styles.sortButton)}>{column.label}{sort?.key === column.key ? <HugeiconsIcon icon={sort.direction === 'asc' ? ArrowUp01Icon : ArrowDown01Icon} size={14} strokeWidth={1.5} aria-hidden="true" /> : null}</button> : column.label}
      </th>)}</tr></thead>
      <tbody key={currentPage} {...stylex.props(styles.pageFade)}>{loading ? Array.from({ length: 6 }, (_, index) => <tr key={index}>{columns.map((column) => <td key={column.key} {...stylex.props(styles.cell)}><span {...stylex.props(styles.skeleton)} /></td>)}</tr>) : pageRows.map((row) => <tr key={rowKey(row)} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter') onRowClick(row) } : undefined} {...mergeRowProps(stylex.props(styles.row, onRowClick && styles.clickable), rowProps?.(row))}>{columns.map((column) => <td key={column.key} {...stylex.props(styles.cell, column.mono && styles.mono, column.align === 'end' && styles.alignEnd)}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table></div>}
    {filtered.length > 0 && !loading ? <footer {...stylex.props(styles.footer)}><Text role="compact">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</Text><div {...stylex.props(styles.pager)}>
      <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))} {...stylex.props(styles.pageButton)}><HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.5} aria-hidden="true" /></button>
      <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage(Math.min(pageCount, currentPage + 1))} {...stylex.props(styles.pageButton)}><HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.5} aria-hidden="true" /></button>
    </div></footer> : null}
  </div>
}
