import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter
  implements ExceptionFilter<ThrottlerException>
{
  catch(_exception: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      message: "Too Many Requests",
      error: "Too Many Requests",
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
    });
  }
}
