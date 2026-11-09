import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { Comment } from '@/types/api';

import { getInfiniteCommentsQueryOptions } from './get-comments';

export const updateCommentInputSchema = z.object({
  body: z.string().refine((body) => body.trim().length > 0, 'Required'),
});

export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const updateComment = ({
  commentId,
  data,
}: {
  commentId: string;
  data: UpdateCommentInput;
}): Promise<Comment> => api.patch(`/comments/${commentId}`, data);

type UseUpdateCommentOptions = {
  discussionId: string;
  mutationConfig?: MutationConfig<typeof updateComment>;
};

export const useUpdateComment = ({
  discussionId,
  mutationConfig,
}: UseUpdateCommentOptions) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    ...restConfig,
    mutationFn: updateComment,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: getInfiniteCommentsQueryOptions(discussionId).queryKey,
      });
      onSuccess?.(...args);
    },
  });
};
