import { clearCourseChatMap, recordCourseChat, useCourseChatMap } from './chats';
import { act, renderHook } from '@testing-library/react';

describe('CourseWing optimistic course-chat overlay', () => {
  beforeEach(() => {
    clearCourseChatMap();
  });

  it('can be cleared when the connected Canvas identity changes', () => {
    const { result } = renderHook(() => useCourseChatMap());

    act(() => recordCourseChat('conversation-1', 42));
    expect(result.current).toEqual({ 'conversation-1': 42 });

    act(() => clearCourseChatMap());
    expect(result.current).toEqual({});
  });
});
