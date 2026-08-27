import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportAttendeeItem {
  fullName: string;
  contact: string;
  role: string;
  otherRole?: string;
  createdAt: string;
  posterUrl?: string;
}

/**
 * Generates and downloads a genuine .xlsx Excel workbook
 */
export function exportToExcel(
  attendees: ExportAttendeeItem[], 
  eventName: string = 'UTQ 20th Anniversary'
): void {
  if (!attendees || attendees.length === 0) return;

  const data = attendees.map((item, index) => ({
    '#': index + 1,
    'Full Name': item.fullName,
    'Contact': item.contact,
    'Role / Status': item.role,
    'Other Specification': item.otherRole || '',
    'Registration Date': new Date(item.createdAt).toLocaleString(),
    'Poster URL': item.posterUrl ? 'Available' : 'N/A'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set column widths for clean readability
  worksheet['!cols'] = [
    { wch: 6 },   // #
    { wch: 25 },  // Full Name
    { wch: 20 },  // Contact
    { wch: 25 },  // Role
    { wch: 22 },  // Other Specification
    { wch: 24 },  // Registration Date
    { wch: 15 }   // Poster URL
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

  const cleanDate = new Date().toISOString().slice(0, 10);
  const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_Attendees_${cleanDate}.xlsx`;
  
  XLSX.writeFile(workbook, filename);
}

/**
 * Generates and downloads a structured, professional PDF report
 */
export function exportToPDF(
  attendees: ExportAttendeeItem[], 
  eventName: string = 'UTQ 20th Anniversary'
): void {
  if (!attendees || attendees.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Header Title & Meta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(11, 39, 118); // Brand Navy #0B2776
  doc.text(eventName, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('Attendee Registration Report', 14, 24);

  const exportDate = new Date().toLocaleString();
  doc.text(`Generated: ${exportDate}`, 14, 30);
  doc.text(`Total Attendees: ${attendees.length}`, 140, 30);

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 34, 196, 34);

  // Table rows
  const tableData = attendees.map((item, index) => [
    String(index + 1),
    item.fullName,
    item.contact,
    item.role,
    new Date(item.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['#', 'Full Name', 'Contact', 'Role', 'Date']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [11, 39, 118],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 45 },
      3: { cellWidth: 50 },
      4: { cellWidth: 26 }
    },
    margin: { left: 14, right: 14 }
  });

  const cleanDate = new Date().toISOString().slice(0, 10);
  const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_Attendees_${cleanDate}.pdf`;
  doc.save(filename);
}
