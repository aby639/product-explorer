import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateViewDto {
  @IsString()
  @MaxLength(120)
  sessionId!: string;

  @IsString()
  @MaxLength(1024)
  path!: string;

  @IsOptional()
  @IsArray()
  trail?: string[];
}
