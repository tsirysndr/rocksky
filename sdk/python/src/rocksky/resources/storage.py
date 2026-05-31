"""``app.rocksky.dropbox.*`` and ``.googledrive.*`` — cloud storage browsing.

Wraps the read-only file listing / download endpoints. All require auth.
"""

from __future__ import annotations

from typing import Any

from ._base import Resource


class DropboxResource(Resource):
    async def list_files(self, *, at: str | None = None) -> Any:
        return await self._transport.query(
            "app.rocksky.dropbox.getFiles", params={"at": at}, auth=True
        )

    async def get_metadata(self, path: str) -> Any:
        return await self._transport.query(
            "app.rocksky.dropbox.getMetadata", params={"path": path}, auth=True
        )

    async def temporary_link(self, path: str) -> Any:
        return await self._transport.query(
            "app.rocksky.dropbox.getTemporaryLink", params={"path": path}, auth=True
        )

    async def download_file(self, file_id: str) -> Any:
        return await self._transport.query(
            "app.rocksky.dropbox.downloadFile", params={"fileId": file_id}, auth=True
        )


class GoogleDriveResource(Resource):
    async def list_files(self, *, at: str | None = None) -> Any:
        return await self._transport.query(
            "app.rocksky.googledrive.getFiles", params={"at": at}, auth=True
        )

    async def get_file(self, file_id: str) -> Any:
        return await self._transport.query(
            "app.rocksky.googledrive.getFile", params={"fileId": file_id}, auth=True
        )

    async def download_file(self, file_id: str) -> Any:
        return await self._transport.query(
            "app.rocksky.googledrive.downloadFile",
            params={"fileId": file_id},
            auth=True,
        )
