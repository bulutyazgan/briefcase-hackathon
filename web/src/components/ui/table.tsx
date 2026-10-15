import * as stylex from '@stylexjs/stylex'
import type { ReactNode } from 'react'
import { styles } from './table.stylex'

export type TableColumn<T> = { key: string; label: string; render: (row: T) => ReactNode; mono?: boolean }

type RowProps = ReturnType<typeof stylex.props>

export function Table<T>({ rows, columns, rowKey, rowProps }: { rows: T[]; columns: TableColumn<T>[]; rowKey: (row: T) => string; rowProps?: (row: T) => RowProps }) {
  return (
    <div {...stylex.props(styles.wrap)}>
      <table {...stylex.props(styles.table)}>
        <thead {...stylex.props(styles.head)}><tr>{columns.map((column) => <th key={column.key} {...stylex.props(styles.heading)} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={rowKey(row)} {...rowProps?.(row)}>{columns.map((column) => <td key={column.key} {...stylex.props(styles.cell, column.mono && styles.mono)}>{column.render(row)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}
