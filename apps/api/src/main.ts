import { config } from "dotenv";
import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { join } from "path";
import { AppModule } from "./app.module";
import { ThrottlerExceptionFilter } from "./throttler-exception.filter";

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());
  app.useStaticAssets(join(__dirname, "..", "uploads", "avatars"), {
    prefix: "/uploads/avatars/",
  });
  app.useStaticAssets(join(__dirname, "..", "uploads", "chats"), {
    prefix: "/uploads/chats/",
  });
  app.useGlobalFilters(new ThrottlerExceptionFilter());
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: "Validation failed",
          errors: formatValidationErrors(errors),
        }),
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3002);
}

void bootstrap();

function formatValidationErrors(errors: ValidationError[]) {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    if (error.constraints) {
      acc[error.property] = Object.values(error.constraints);
    }

    return acc;
  }, {});
}

function getCorsOrigins() {
  const origins =
    process.env.WEB_URL ?? process.env.FRONTEND_URL ?? "http://localhost:3000";

  return origins.split(",").map((origin) => origin.trim());
}
