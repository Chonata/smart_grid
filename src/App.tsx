import React, { useMemo, useState } from 'react';

// Types and Interfaces
interface RowData {
    [key: string]: unknown;
}

interface ColumnarData {
    [columnName: string]: unknown[];
}

interface ColumnStats {
    min: number;
    max: number;
    mean: number;
    sum: number;
    count: number; // non-null count
}

interface ColumnarResult {
    columns: string[];
    data: ColumnarData;
    rowCount: number;
    stats: { [columnName: string]: ColumnStats };
}

type DataType = 'number' | 'boolean' | 'date' | 'string';

interface ColumnTypeMap {
    [columnName: string]: DataType;
}

interface ColumnOverride {
    headerName?: string;
    format?: string;
}

interface ColumnOverrides {
    [columnName: string]: ColumnOverride;
}

interface DataGridProps {
    data?: RowData[];
    columnOverrides?: ColumnOverrides;
}

/**
 * Converts row-based data to columnar format
 * Optimized for uniform data but handles sparse data gracefully
 * Computes statistics for numeric columns in a single pass
 */
const convertToColumnar = (rows: RowData[]): ColumnarResult => {
    if (!rows || rows.length === 0) {
        return { columns: [], data: {}, rowCount: 0, stats: {} };
    }

    // Start optimistically: assume uniform data (fast path)
    const columns = Object.keys(rows[0]);
    const data: ColumnarData = {};
    const stats: { [key: string]: ColumnStats } = {};

    // Pre-allocate arrays for known columns
    columns.forEach(col => {
        data[col] = new Array(rows.length);
    });

    // Track all columns (for sparse data detection)
    const allColumns = new Set(columns);

    // Single pass: convert + compute stats
    rows.forEach((row, i) => {
        // Check for new columns (sparse data handling)
        Object.keys(row).forEach(key => {
            if (!allColumns.has(key)) {
                allColumns.add(key);
                // Backfill new column with nulls for previous rows
                data[key] = new Array(i).fill(null);
            }
        });

        // Assign values and compute stats
        allColumns.forEach(col => {
            const value = row[col] ?? null;

            // Ensure array exists for this column
            if (!data[col]) {
                data[col] = new Array(i).fill(null);
            }

            data[col][i] = value;

            // Compute stats for numeric columns on the fly
            if (typeof value === 'number' && !isNaN(value) && col != 'id') {
                if (!stats[col]) {
                    stats[col] = {
                        min: value,
                        max: value,
                        sum: value,
                        count: 1,
                        mean: 0
                    };
                } else {
                    stats[col].min = Math.min(stats[col].min, value);
                    stats[col].max = Math.max(stats[col].max, value);
                    stats[col].sum += value;
                    stats[col].count++;
                }
            }
        });

        // Fill nulls for columns missing in this row
        allColumns.forEach(col => {
            if (data[col].length === i) {
                data[col].push(null);
            }
        });
    });

    // Calculate means
    Object.keys(stats).forEach(col => {
        stats[col].mean = stats[col].sum / stats[col].count;
    });

    return {
        columns: Array.from(allColumns),
        data,
        rowCount: rows.length,
        stats
    };
};

/**
 * Infer data type from column values
 */
const inferType = (columnData: any[]): DataType => {
    // Find first non-null value
    const sample = columnData.find(val => val !== null && val !== undefined);

    if (sample === undefined) return 'string';

    if (typeof sample === 'boolean') return 'boolean';
    if (typeof sample === 'number') return 'number';

    // Check if it's a date string
    if (typeof sample === 'string') {
        const dateTest = new Date(sample);
        if (!isNaN(dateTest.getTime()) && sample.match(/\d{4}-\d{2}-\d{2}/)) {
            return 'date';
        }
    }

    return 'string';
};

/**
 * Format cell value based on inferred type
 */
const formatValue = (value: any, type: DataType): string => {
    if (value === null || value === undefined) return '';

    switch (type) {
        case 'number':
            return typeof value === 'number' ? value.toLocaleString() : value;
        case 'date':
            return new Date(value).toLocaleDateString();
        case 'boolean':
            return value ? '✓' : '✗';
        default:
            return String(value);
    }
};

/**
 * Auto-detecting data grid with columnar storage
 */
const DataGrid: React.FC<DataGridProps> = ({ data = [], columnOverrides = {} }) => {
    const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);

    // Convert to columnar format and compute stats
    const { columns, data: columnarData, rowCount, stats } = useMemo(
        () => convertToColumnar(data),
        [data]
    );

    // Infer column types
    const columnTypes: ColumnTypeMap = useMemo(() => {
        const types: ColumnTypeMap = {};
        columns.forEach(col => {
            types[col] = inferType(columnarData[col]);
        });
        return types;
    }, [columns, columnarData]);

    // Generate display names for columns (convert camelCase to Title Case)
    const getDisplayName = (columnName: string): string => {
        if (columnOverrides[columnName]?.headerName) {
            return columnOverrides[columnName].headerName!;
        }

        // Convert camelCase/snake_case to readable format
        return columnName
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    if (columns.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No data to display
            </div>
        );
    }

    return (
        <div style={{ overflow: 'auto', width: '100%', height: '100%' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                <tr>
                    {columns.map((col, index) => {
                        const hasStats = stats[col] !== undefined;
                        const isHovered = hoveredColumn === col;

                        return (
                            <th
                                key={`${col}-${index}`}
                                onMouseEnter={() => setHoveredColumn(col)}
                                onMouseLeave={() => setHoveredColumn(null)}
                                style={{
                                    border: '1px solid #ddd',
                                    padding: '12px 8px',
                                    textAlign: 'left',
                                    backgroundColor: isHovered ? '#e8f4f8' : '#f8f9fa',
                                    fontWeight: '600',
                                    position: 'sticky',
                                    top: 0,
                                    fontSize: '14px',
                                    color: '#333',
                                    cursor: hasStats ? 'help' : 'default',
                                    transition: 'background-color 0.2s',
                                    verticalAlign: 'top'
                                }}
                            >
                                <div>
                                    {getDisplayName(col)}
                                    <span style={{
                                        fontSize: '11px',
                                        color: '#999',
                                        marginLeft: '6px',
                                        fontWeight: 'normal'
                                    }}>
                      {columnTypes[col]}
                    </span>
                                </div>

                                {/* Stats tooltip on hover */}
                                {hasStats && isHovered && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: '0',
                                        backgroundColor: '#2c3e50',
                                        color: 'white',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 'normal',
                                        zIndex: 1000,
                                        minWidth: '200px',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                        marginTop: '4px'
                                    }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#3498db' }}>
                                            Statistics
                                        </div>
                                        <div style={{ display: 'grid', gap: '4px' }}>
                                            <div>Min: <strong>{stats[col].min.toLocaleString()}</strong></div>
                                            <div>Max: <strong>{stats[col].max.toLocaleString()}</strong></div>
                                            <div>Mean: <strong>{stats[col].mean.toFixed(2)}</strong></div>
                                            <div>Sum: <strong>{stats[col].sum.toLocaleString()}</strong></div>
                                            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #34495e' }}>
                                                Count: <strong>{stats[col].count.toLocaleString()}</strong>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </th>
                        );
                    })}
                </tr>
                </thead>
                <tbody>
                {Array.from({ length: rowCount }).map((_, rowIndex) => (
                    <tr
                        key={rowIndex}
                        style={{
                            backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#fafafa'
                        }}
                    >
                        {columns.map((col, colIndex) => {
                            const value = columnarData[col][rowIndex];
                            const type = columnTypes[col];

                            return (
                                <td
                                    key={`${rowIndex}-${colIndex}`}
                                    style={{
                                        border: '1px solid #e0e0e0',
                                        padding: '8px',
                                        fontSize: '14px',
                                        color: value === null ? '#ccc' : '#333',
                                        textAlign: type === 'number' ? 'right' : 'left'
                                    }}
                                >
                                    {formatValue(value, type)}
                                </td>
                            );
                        })}
                    </tr>
                ))}
                </tbody>
            </table>

            <div style={{
                padding: '12px',
                fontSize: '12px',
                color: '#666',
                borderTop: '1px solid #e0e0e0',
                backgroundColor: '#f8f9fa'
            }}>
                {rowCount.toLocaleString()} rows × {columns.length} columns
                <span style={{ marginLeft: '16px', color: '#999' }}>
          Columnar storage • {Object.keys(stats).length} numeric columns with stats
        </span>
            </div>
        </div>
    );
};

// Example usage
function App() {
    // Sample API response - no column definitions needed!
    const apiData: RowData[] = [
        { id: 1, name: 'Alice Johnson', age: 28, city: 'New York', salary: 85000, isActive: true, joinDate: '2022-01-15' },
        { id: 2, name: 'Bob Smith', age: 34, city: 'London', salary: 92000, isActive: true, joinDate: '2021-06-20' },
        { id: 3, name: 'Charlie Brown', age: 45, city: 'Paris', salary: 78000, isActive: false, joinDate: '2020-03-10' },
        { id: 4, name: 'Diana Prince', age: 29, city: 'Tokyo', salary: null, isActive: true, joinDate: '2023-02-28' },
        { id: 5, name: 'Ethan Hunt', age: 38, city: 'Sydney', salary: 88000, isActive: true, joinDate: '2021-11-05' },
        { id: 6, name: 'Fiona Apple', age: 31, city: 'Berlin', salary: 91000, isActive: true, joinDate: '2022-08-12' },
        // Sparse data - missing 'city' field
        { id: 7, name: 'George Wilson', age: 42, salary: 87000, isActive: false, joinDate: '2020-09-18' },
    ];

    return (
        <div style={{ padding: '20px', height: '600px' }}>
            <h1 style={{ marginBottom: '8px' }}>Auto-Detecting Data Grid</h1>
            <p style={{ color: '#666', marginBottom: '20px' }}>
                Just pass your JSON data - no column definitions needed!
            </p>

            <DataGrid data={apiData} />

            <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f0f7ff', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Features:</h3>
                <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
                    <li>✅ Zero configuration - auto-detects columns from data</li>
                    <li>✅ Optimized columnar storage (fast path for uniform data, handles sparse gracefully)</li>
                    <li>✅ Type inference (number, string, date, boolean)</li>
                    <li>✅ Smart formatting based on type</li>
                    <li>✅ Handles sparse/missing data gracefully</li>
                    <li>✅ Auto-generated readable column headers</li>
                    <li>✅ Full TypeScript support with type safety</li>
                    <li>✅ <strong>Statistics computed in single pass (min, max, mean, sum, count)</strong></li>
                    <li>✅ <strong>Hover numeric column headers to see statistics</strong></li>
                </ul>
            </div>
        </div>
    );
}

export default App;