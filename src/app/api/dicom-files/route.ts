import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as dicomParser from 'dicom-parser';

interface DicomSeries {
  id: string;
  name: string;
  description: string;
  files: string[];
  thumbnail?: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  seriesNumber?: number;
  instanceCount: number;
}

export async function GET() {
  try {
    const dicomDir = path.join(process.cwd(), 'public', 'dicom');

    if (!fs.existsSync(dicomDir)) {
      return NextResponse.json({ series: [] });
    }

    const files = fs.readdirSync(dicomDir)
      .filter(file => file.toLowerCase().endsWith('.dcm') || file.toLowerCase().endsWith('.dicom'))
      .sort();

    // Parse DICOM metadata and group by series
    const seriesGroups: { [key: string]: {
      files: string[];
      metadata: {
        studyInstanceUID?: string;
        seriesInstanceUID?: string;
        seriesDescription?: string;
        seriesNumber?: number;
        modality?: string;
        patientName?: string;
        studyDescription?: string;
      };
    }} = {};

    for (const file of files) {
      try {
        const filePath = path.join(dicomDir, file);
        const dicomData = fs.readFileSync(filePath);
        const dataSet = dicomParser.parseDicom(new Uint8Array(dicomData));

        // Extract key DICOM tags
        const studyInstanceUID = dataSet.string('x0020000d') || 'unknown-study';
        const seriesInstanceUID = dataSet.string('x0020000e') || 'unknown-series';
        const seriesDescription = dataSet.string('x0008103e') || '';
        const seriesNumber = dataSet.intString('x00200011') || 0;
        const modality = dataSet.string('x00080060') || '';
        const patientName = dataSet.string('x00100010') || '';
        const studyDescription = dataSet.string('x00081030') || '';

        const seriesKey = seriesInstanceUID;

        if (!seriesGroups[seriesKey]) {
          seriesGroups[seriesKey] = {
            files: [],
            metadata: {
              studyInstanceUID,
              seriesInstanceUID,
              seriesDescription,
              seriesNumber,
              modality,
              patientName,
              studyDescription
            }
          };
        }

        seriesGroups[seriesKey].files.push(`/dicom/${file}`);
      } catch (parseError) {
        console.warn(`Failed to parse DICOM file ${file}:`, parseError);
        // Fallback: group by filename pattern
        const parts = file.split('.');
        const fallbackKey = parts.length >= 8 ? parts[7] : 'unknown';
        if (!seriesGroups[fallbackKey]) {
          seriesGroups[fallbackKey] = {
            files: [],
            metadata: {
              seriesDescription: `Series ${fallbackKey}`,
              seriesNumber: 0
            }
          };
        }
        seriesGroups[fallbackKey].files.push(`/dicom/${file}`);
      }
    }

    // Create series objects with parsed metadata
    const series: DicomSeries[] = [];

    Object.entries(seriesGroups).forEach(([seriesKey, group]) => {
      const { files, metadata } = group;

      // Sort files by instance number if available, otherwise alphabetically
      const sortedFiles = files.sort((a, b) => {
        // Extract instance numbers from filenames if possible
        const aNum = extractInstanceNumber(a);
        const bNum = extractInstanceNumber(b);
        if (aNum !== null && bNum !== null) {
          return aNum - bNum;
        }
        return a.localeCompare(b);
      });

      // Determine series name from metadata
      let name = metadata.seriesDescription || `Series ${metadata.seriesNumber || 'Unknown'}`;
      if (metadata.modality) {
        name = `${metadata.modality} - ${name}`;
      }

      // Clean up series description
      if (!metadata.seriesDescription && files.length <= 5) {
        name = 'Scout Images';
      }

      series.push({
        id: seriesKey,
        name: name.trim(),
        description: `${files.length} images`,
        files: sortedFiles,
        thumbnail: sortedFiles[0],
        studyInstanceUID: metadata.studyInstanceUID,
        seriesInstanceUID: metadata.seriesInstanceUID,
        seriesNumber: metadata.seriesNumber,
        instanceCount: files.length
      });
    });

    // Sort series by series number, then by instance count
    series.sort((a, b) => {
      // First by series number
      if (a.seriesNumber !== undefined && b.seriesNumber !== undefined) {
        if (a.seriesNumber !== b.seriesNumber) {
          return a.seriesNumber - b.seriesNumber;
        }
      }
      // Then by instance count (scouts first)
      if (a.instanceCount <= 5 && b.instanceCount > 5) return -1;
      if (a.instanceCount > 5 && b.instanceCount <= 5) return 1;
      return a.instanceCount - b.instanceCount;
    });

    return NextResponse.json({ series });
  } catch (error) {
    console.error('Error reading DICOM files:', error);
    return NextResponse.json({ error: 'Failed to read DICOM files' }, { status: 500 });
  }
}

function extractInstanceNumber(filename: string): number | null {
  // Try to extract instance number from filename
  const match = filename.match(/\.(\d+)\.dcm$/);
  return match ? parseInt(match[1]) : null;
}