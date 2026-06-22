export type Result<T = any> = 
  | {
      success: true;
      data: T;
      error: null;
    }
  | {
      success: false;
      data: null;
      error: {
        code: string
        msg: string
      };
    };