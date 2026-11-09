import { HttpResponse, http } from 'msw';
import { z } from 'zod';

import { env } from '@/config/env';

import { db, persistDb } from '../db';
import { networkDelay, requireAuth, sanitizeUser } from '../utils';

type CreateCommentBody = {
  body: string;
  discussionId: string;
};

const updateCommentBodySchema = z.object({
  body: z.string().refine((body) => body.trim().length > 0, 'Required'),
});

export const commentsHandlers = [
  http.get(`${env.API_URL}/comments`, async ({ request, cookies }) => {
    await networkDelay();

    try {
      const { error } = requireAuth(cookies);
      if (error) {
        return HttpResponse.json({ message: error }, { status: 401 });
      }
      const url = new URL(request.url);
      const discussionId = url.searchParams.get('discussionId') || '';
      const page = Number(url.searchParams.get('page') || 1);

      const total = db.comment.count({
        where: {
          discussionId: {
            equals: discussionId,
          },
        },
      });

      const totalPages = Math.ceil(total / 10);

      const comments = db.comment
        .findMany({
          where: {
            discussionId: {
              equals: discussionId,
            },
          },
          take: 10,
          skip: 10 * (page - 1),
        })
        .map(({ authorId, ...comment }) => {
          const author = db.user.findFirst({
            where: {
              id: {
                equals: authorId,
              },
            },
          });
          return {
            ...comment,
            author: author ? sanitizeUser(author) : {},
          };
        });
      return HttpResponse.json({
        data: comments,
        meta: {
          page,
          total,
          totalPages,
        },
      });
    } catch (error: any) {
      return HttpResponse.json(
        { message: error?.message || 'Server Error' },
        { status: 500 },
      );
    }
  }),

  http.post(`${env.API_URL}/comments`, async ({ request, cookies }) => {
    await networkDelay();

    try {
      const { user, error } = requireAuth(cookies);
      if (error) {
        return HttpResponse.json({ message: error }, { status: 401 });
      }
      const data = (await request.json()) as CreateCommentBody;
      const result = db.comment.create({
        authorId: user?.id,
        ...data,
      });
      await persistDb('comment');
      return HttpResponse.json(result);
    } catch (error: any) {
      return HttpResponse.json(
        { message: error?.message || 'Server Error' },
        { status: 500 },
      );
    }
  }),

  http.patch(
    `${env.API_URL}/comments/:commentId`,
    async ({ params, request, cookies }) => {
      await networkDelay();

      try {
        const { user, error } = requireAuth(cookies);
        if (error || !user) {
          return HttpResponse.json(
            { message: 'Unauthorized' },
            { status: 401 },
          );
        }
        const commentId = params.commentId as string;
        const comment = db.comment.findFirst({
          where: { id: { equals: commentId } },
        });
        if (!comment) {
          return HttpResponse.json(
            { message: 'Comment not found' },
            { status: 404 },
          );
        }
        if (comment.authorId !== user.id) {
          return HttpResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
        const parsed = updateCommentBodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return HttpResponse.json(
            { message: 'Comment body is required' },
            { status: 400 },
          );
        }
        const result = db.comment.update({
          where: { id: { equals: commentId } },
          data: { body: parsed.data.body },
        });
        await persistDb('comment');
        return HttpResponse.json({ ...result, author: sanitizeUser(user) });
      } catch (error: any) {
        return HttpResponse.json(
          { message: error?.message || 'Server Error' },
          { status: 500 },
        );
      }
    },
  ),

  http.delete(
    `${env.API_URL}/comments/:commentId`,
    async ({ params, cookies }) => {
      await networkDelay();

      try {
        const { user, error } = requireAuth(cookies);
        if (error) {
          return HttpResponse.json({ message: error }, { status: 401 });
        }
        const commentId = params.commentId as string;
        const result = db.comment.delete({
          where: {
            id: {
              equals: commentId,
            },
            ...(user?.role === 'USER' && {
              authorId: {
                equals: user.id,
              },
            }),
          },
        });
        await persistDb('comment');
        return HttpResponse.json(result);
      } catch (error: any) {
        return HttpResponse.json(
          { message: error?.message || 'Server Error' },
          { status: 500 },
        );
      }
    },
  ),
];
