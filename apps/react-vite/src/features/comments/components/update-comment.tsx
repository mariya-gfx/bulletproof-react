import { Pen } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Form, FormDrawer, Textarea } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';
import { Comment } from '@/types/api';

import {
  updateCommentInputSchema,
  useUpdateComment,
} from '../api/update-comment';

type UpdateCommentProps = {
  comment: Comment;
};

export const UpdateComment = ({ comment }: UpdateCommentProps) => {
  const submitting = useRef(false);
  const { addNotification } = useNotifications();
  const updateCommentMutation = useUpdateComment({
    discussionId: comment.discussionId,
    mutationConfig: {
      onSuccess: () => {
        addNotification({ type: 'success', title: 'Comment Updated' });
      },
      onSettled: () => {
        submitting.current = false;
      },
    },
  });
  const formId = `update-comment-${comment.id}`;

  return (
    <FormDrawer
      isDone={updateCommentMutation.isSuccess}
      title="Edit Comment"
      triggerButton={
        <Button
          size="sm"
          icon={<Pen className="size-4" />}
          disabled={updateCommentMutation.isPending}
          onClick={() => updateCommentMutation.reset()}
        >
          Edit Comment
        </Button>
      }
      submitButton={
        <Button
          form={formId}
          type="submit"
          size="sm"
          isLoading={updateCommentMutation.isPending}
          disabled={updateCommentMutation.isPending}
        >
          Save
        </Button>
      }
    >
      <Form
        id={formId}
        schema={updateCommentInputSchema}
        options={{ defaultValues: { body: comment.body } }}
        onSubmit={(values) => {
          if (submitting.current) return;
          submitting.current = true;
          updateCommentMutation.mutate({ commentId: comment.id, data: values });
        }}
      >
        {({ register, formState }) => (
          <Textarea
            label="Body"
            error={formState.errors['body']}
            registration={register('body')}
          />
        )}
      </Form>
    </FormDrawer>
  );
};
