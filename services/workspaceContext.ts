const WORKSPACE_TYPE_KEY =
  'snabbb.inventory.workspaceType';

const WORKSPACE_OWNER_KEY =
  'snabbb.inventory.workspaceOwnerUserId';

export type WorkspaceType =
  | 'personal'
  | 'company';

export function captureWorkspaceFromUrl() {
  const url =
    new URL(window.location.href);

  const requestedType =
    url.searchParams.get(
      'workspace_type'
    );

  const requestedOwnerId =
    url.searchParams.get(
      'workspace_owner_id'
    );

  if (
    requestedType === 'company' &&
    requestedOwnerId
  ) {
    sessionStorage.setItem(
      WORKSPACE_TYPE_KEY,
      'company'
    );

    sessionStorage.setItem(
      WORKSPACE_OWNER_KEY,
      requestedOwnerId
    );
  } else if (
    requestedType === 'personal'
  ) {
    sessionStorage.setItem(
      WORKSPACE_TYPE_KEY,
      'personal'
    );

    sessionStorage.removeItem(
      WORKSPACE_OWNER_KEY
    );
  }

  if (
    requestedType === 'personal' ||
    requestedType === 'company'
  ) {
    url.searchParams.delete(
      'workspace_type'
    );

    url.searchParams.delete(
      'workspace_owner_id'
    );

    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${url.search}${url.hash}`
    );
  }
}

export function getWorkspaceOwnerUserId() {
  const type =
    sessionStorage.getItem(
      WORKSPACE_TYPE_KEY
    );

  if (type !== 'company') {
    return null;
  }

  return sessionStorage.getItem(
    WORKSPACE_OWNER_KEY
  );
}

export function getWorkspaceType():
  WorkspaceType {
  return sessionStorage.getItem(
    WORKSPACE_TYPE_KEY
  ) === 'company'
    ? 'company'
    : 'personal';
}