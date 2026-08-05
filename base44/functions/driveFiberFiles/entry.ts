import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Google Drive browser for fiber geometry files (admin only).
// action "list"  -> folders + geometry files inside folder_id (default: My Drive root), or a name search
// action "fetch" -> downloads the chosen Drive file and re-uploads it to Base44 storage,
//                   returning a file_url the existing KMZ/geometry importers already accept.
const GEOMETRY_EXT = ['.kmz', '.kml', '.geojson', '.json', '.zip'];

function isGeometryFile(name) {
  const lower = String(name || '').toLowerCase();
  return GEOMETRY_EXT.some((ext) => lower.endsWith(ext));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    if (action === 'fetch') {
      const fileId = body.file_id;
      if (!fileId) return Response.json({ error: 'file_id is required' }, { status: 400 });

      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
        { headers: authHeader },
      );
      if (!metaRes.ok) {
        return Response.json({ error: `Drive metadata failed: ${await metaRes.text()}` }, { status: 502 });
      }
      const meta = await metaRes.json();

      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: authHeader },
      );
      if (!dlRes.ok) {
        return Response.json({ error: `Drive download failed: ${await dlRes.text()}` }, { status: 502 });
      }
      const blob = await dlRes.blob();
      const file = new File([blob], meta.name || 'drive-file', {
        type: meta.mimeType || 'application/octet-stream',
      });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      return Response.json({
        file_url: uploaded.file_url,
        name: meta.name,
        mime_type: meta.mimeType,
        size: meta.size ? Number(meta.size) : null,
        source: 'Google Drive',
      });
    }

    // action === "list"
    const search = String(body.search || '').trim();
    const folderId = body.folder_id || 'root';
    const escaped = search.replace(/'/g, "\\'");
    const q = search
      ? `name contains '${escaped}' and trashed = false`
      : `'${folderId}' in parents and trashed = false`;

    const params = new URLSearchParams({
      q,
      pageSize: '200',
      orderBy: 'folder,name',
      fields: 'files(id,name,mimeType,size,modifiedTime,parents)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: authHeader });
    if (!listRes.ok) {
      return Response.json({ error: `Drive list failed: ${await listRes.text()}` }, { status: 502 });
    }
    const listed = (await listRes.json()).files || [];

    const folders = listed
      .filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
      .map((f) => ({ id: f.id, name: f.name }));
    const files = listed
      .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder' && isGeometryFile(f.name))
      .map((f) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mimeType,
        size: f.size ? Number(f.size) : null,
        modified_time: f.modifiedTime || null,
      }));

    // Breadcrumb name for the folder currently open.
    let folderName = 'My Drive';
    if (folderId !== 'root' && !search) {
      const fRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents&supportsAllDrives=true`,
        { headers: authHeader },
      );
      if (fRes.ok) {
        const info = await fRes.json();
        folderName = info.name || 'Folder';
      }
    }

    return Response.json({ folder_id: folderId, folder_name: folderName, folders, files, search: search || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}