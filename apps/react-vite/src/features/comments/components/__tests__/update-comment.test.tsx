import Cookies from 'js-cookie';
import { delay, http, HttpResponse } from 'msw';

import { env } from '@/config/env';
import { db } from '@/testing/mocks/db';
import { server } from '@/testing/mocks/server';
import { AUTH_COOKIE } from '@/testing/mocks/utils';
import {
  createUser,
  loginAsUser,
  renderApp,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/testing/test-utils';

import { CommentsList } from '../comments-list';

const setup = async (role = 'USER', count = 1) => {
  const user = await createUser({ role });
  const discussionId = `discussion-${user.id}`;
  const comments = Array.from({ length: count }, (_, index) =>
    db.comment.create({
      discussionId,
      authorId: user.id,
      body: `Original comment ${index + 1}`,
    }),
  );
  await renderApp(<CommentsList discussionId={discussionId} />, { user });
  await screen.findByText(comments[0].body);
  return { user, comments, discussionId };
};

const openEditor = async (body: string) => {
  const row = screen.getByRole('listitem', {
    name: new RegExp(`comment-${body}-`),
  });
  await userEvent.click(
    within(row).getByRole('button', { name: 'Edit Comment' }),
  );
  const drawer = await screen.findByRole('dialog', { name: 'Edit Comment' });
  return {
    drawer,
    field: within(drawer).getByRole('textbox', { name: 'Body' }),
    save: within(drawer).getByRole('button', { name: 'Save' }),
  };
};

test.each(['USER', 'ADMIN'])(
  '%s can edit their own comment repeatedly',
  async (role) => {
    const { comments } = await setup(role);
    const { drawer, field, save } = await openEditor(comments[0].body);
    expect(field).toHaveValue(comments[0].body);
    await userEvent.clear(field);
    await userEvent.type(field, 'Updated comment');
    await userEvent.click(save);
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
    expect(await screen.findByText('Updated comment')).toBeInTheDocument();
    expect(await screen.findByText('Comment Updated')).toBeInTheDocument();

    const reopened = await openEditor('Updated comment');
    expect(reopened.field).toHaveValue('Updated comment');
    await userEvent.type(reopened.field, ' again');
    await userEvent.click(reopened.save);
    await waitFor(() => expect(reopened.drawer).not.toBeInTheDocument());
    expect(
      await screen.findByText('Updated comment again'),
    ).toBeInTheDocument();
  },
);

test.each(['', '   '])(
  'rejects invalid body %j without sending PATCH',
  async (body) => {
    const { comments } = await setup();
    const handler = vi.fn(() => HttpResponse.json({}));
    server.use(http.patch(`${env.API_URL}/comments/:commentId`, handler));
    const { drawer, field, save } = await openEditor(comments[0].body);
    await userEvent.clear(field);
    if (body) await userEvent.type(field, body);
    await userEvent.click(save);
    expect(await within(drawer).findByText('Required')).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
    expect(
      db.comment.findFirst({ where: { id: { equals: comments[0].id } } })?.body,
    ).toBe(comments[0].body);
  },
);

test('closing discards the draft without modifying the comment', async () => {
  const { comments } = await setup();
  const handler = vi.fn(() => HttpResponse.json({}));
  server.use(http.patch(`${env.API_URL}/comments/:commentId`, handler));
  const { drawer, field } = await openEditor(comments[0].body);
  await userEvent.clear(field);
  await userEvent.type(field, 'Cancelled draft');
  const actions = within(drawer).getByRole('group', { name: 'Form actions' });
  await userEvent.click(within(actions).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  expect(screen.getByText(comments[0].body)).toBeInTheDocument();
  const reopened = await openEditor(comments[0].body);
  expect(reopened.field).toHaveValue(comments[0].body);
  expect(handler).not.toHaveBeenCalled();
});

test('preserves failed drafts, reports the error, prevents duplicate saves and allows retry', async () => {
  const { comments } = await setup();
  const handler = vi.fn(async () => {
    await delay(300);
    return HttpResponse.json({ message: 'Save failed' }, { status: 500 });
  });
  server.use(http.patch(`${env.API_URL}/comments/:commentId`, handler));
  const { drawer, field, save } = await openEditor(comments[0].body);
  await userEvent.clear(field);
  await userEvent.type(field, 'My draft');
  await userEvent.dblClick(save);
  expect(save).toBeDisabled();
  expect(await screen.findByText('Save failed')).toBeInTheDocument();
  await waitFor(() => expect(save).toBeEnabled());
  expect(handler).toHaveBeenCalledTimes(1);
  expect(drawer).toBeInTheDocument();
  expect(field).toHaveValue('My draft');
  expect(
    db.comment.findFirst({ where: { id: { equals: comments[0].id } } })?.body,
  ).toBe(comments[0].body);
  server.resetHandlers();
  await userEvent.click(save);
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  expect(await screen.findByText('My draft')).toBeInTheDocument();
});

test.each(['USER', 'ADMIN'])(
  '%s cannot see edit controls for another author',
  async (role) => {
    const user = await createUser({ role });
    const other = await createUser();
    const comment = db.comment.create({
      discussionId: user.id,
      authorId: other.id,
      body: 'Another author',
    });
    await renderApp(<CommentsList discussionId={comment.discussionId} />, {
      user,
    });
    await screen.findByText(comment.body);
    expect(
      screen.queryByRole('button', { name: 'Edit Comment' }),
    ).not.toBeInTheDocument();
  },
);

test('editing a later page retains loaded pages and allows loading the next page', async () => {
  const { comments } = await setup('USER', 21);
  await userEvent.click(
    screen.getByRole('button', { name: 'Load More Comments' }),
  );
  await screen.findByText(comments[19].body);
  const { drawer, field, save } = await openEditor(comments[15].body);
  await userEvent.clear(field);
  await userEvent.type(field, 'Updated later page');
  await userEvent.click(save);
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  await screen.findByText('Updated later page');
  expect(screen.getByText(comments[0].body)).toBeInTheDocument();
  expect(screen.getByText(comments[19].body)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  await userEvent.click(
    screen.getByRole('button', { name: 'Load More Comments' }),
  );
  await screen.findByText(comments[20].body);
  expect(screen.getAllByRole('listitem')).toHaveLength(21);
});

const patchComment = (id: string, data: unknown) =>
  fetch(`${env.API_URL}/comments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

test.each(['USER', 'ADMIN'])(
  'PATCH independently denies %s editing another author',
  async (role) => {
    const user = await createUser({ role });
    const other = await createUser();
    const comment = db.comment.create({
      authorId: other.id,
      body: 'Unchanged',
    });
    await loginAsUser(user);
    const response = await patchComment(comment.id, {
      body: 'Forbidden edit',
      authorId: user.id,
    });
    expect(response.status).toBe(403);
    expect(
      db.comment.findFirst({ where: { id: { equals: comment.id } } })?.body,
    ).toBe('Unchanged');
  },
);

test.each(['', ' \n\t ', null, 123])(
  'PATCH rejects invalid body %j',
  async (body) => {
    const user = await createUser();
    await loginAsUser(user);
    const comment = db.comment.create({ authorId: user.id, body: 'Unchanged' });
    expect((await patchComment(comment.id, { body })).status).toBe(400);
    expect(
      db.comment.findFirst({ where: { id: { equals: comment.id } } })?.body,
    ).toBe('Unchanged');
  },
);

test('PATCH requires authentication and returns 404 for a missing comment', async () => {
  Cookies.remove(AUTH_COOKIE);
  expect((await patchComment('missing', { body: 'Edit' })).status).toBe(401);
  await loginAsUser(await createUser());
  expect((await patchComment('missing', { body: 'Edit' })).status).toBe(404);
});

test('PATCH only updates the body and returns the author', async () => {
  const user = await createUser();
  await loginAsUser(user);
  const comment = db.comment.create({
    authorId: user.id,
    discussionId: 'original',
    body: 'Before',
  });
  const response = await patchComment(comment.id, {
    body: 'After',
    authorId: 'forged',
    discussionId: 'forged',
    createdAt: 0,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ...comment,
    body: 'After',
    author: { id: user.id },
  });
  expect(
    db.comment.findFirst({ where: { id: { equals: comment.id } } }),
  ).toEqual({ ...comment, body: 'After' });
});
