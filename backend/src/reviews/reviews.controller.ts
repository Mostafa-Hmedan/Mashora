import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('bookings/:bookingId/review')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createForBooking(user.userId, bookingId, dto);
  }

  @Public()
  @Get('doctors/:doctorId/reviews')
  listForDoctor(@Param('doctorId') doctorId: string) {
    return this.reviewsService.listForDoctor(doctorId);
  }
}
